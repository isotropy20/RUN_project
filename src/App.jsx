import React, { useEffect, useMemo, useState } from "react";

/**
 * 半馬訓練課表 App（單檔 React Component）
 * - 依使用者目前 5K 配速 / 半馬目標自動產生 8~16 週課表
 * - 內建期化（Base → Build → Peak → Taper）
 * - 以 localStorage 保存/載入
 * - 匯出 CSV
 * - Tailwind UI（此畫布可預覽）
 *
 * 使用方法：
 * 1) 填入目前 5K 成績與目標半馬時間（或留空只用 5K 估配速）
 * 2) 選擇週數 / 每週跑量日數 / 開始日期
 * 3) 產生課表 → 可儲存、匯出 CSV
 */

// ===== 小工具：時間與配速 =====
const pad2 = (n) => String(n).padStart(2, "0");
const timeToSeconds = (t) => {
  if (!t) return null;
  const parts = t.split(":").map(Number);
  if (parts.some((x) => Number.isNaN(x))) return null;
  if (parts.length === 3) {
    const [hh, mm, ss] = parts; return hh * 3600 + mm * 60 + ss;
  } else if (parts.length === 2) {
    const [mm, ss] = parts; return mm * 60 + ss;
  } else if (parts.length === 1) {
    return parts[0];
  }
  return null;
};
const secondsToTime = (s) => {
  if (s == null) return "";
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = Math.round(s % 60);
  return hh > 0 ? `${hh}:${pad2(mm)}:${pad2(ss)}` : `${mm}:${pad2(ss)}`;
};

// 以 Jack Daniels-ish 的簡化規則估配速（非常粗略，只作訓練相對配速用途）
function estimatePacesFrom5K(sec5k) {
  if (!sec5k) return null;
  const pace5k = sec5k / 5; // 每公里秒數
  return {
    easy: pace5k * 1.2,        // E: 20% 慢
    marathon: pace5k * 1.12,   // M: 約慢 12%
    threshold: pace5k * 1.05,  // T: 約慢 5%
    interval: pace5k * 0.95,   // I: 約快 5%
    repeat: pace5k * 0.90,     // R: 約快 10%
    long: pace5k * 1.18,       // LSD: 18% 慢
  };
}

const mPerKm = (sPerKm) => `${Math.floor(sPerKm/60)}:${pad2(Math.round(sPerKm%60))}/km`;

// ===== 課表生成 =====
const BLOCKS = [
  { key: "base", name: "Base", desc: "有氧基礎、建立習慣" },
  { key: "build", name: "Build", desc: "強化乳酸閾值/間歇" },
  { key: "peak", name: "Peak", desc: "巔峰整合、特異性" },
  { key: "taper", name: "Taper", desc: "減量、保持銳度" },
];

function splitWeeks(totalWeeks) {
  // 依總週數分配各期比例（粗略）
  const t = totalWeeks;
  const base = Math.max(2, Math.round(t * 0.35));
  const build = Math.max(2, Math.round(t * 0.30));
  const peak = Math.max(2, Math.round(t * 0.20));
  let used = base + build + peak;
  const taper = Math.max(2, t - used);
  used += taper;
  // 微調：確保總和 = t
  if (used !== t) {
    const diff = t - used; // 可能是 -1, +1
    return { base, build, peak: peak + Math.max(0, diff), taper: taper + Math.max(0, -diff) };
  }
  return { base, build, peak, taper };
}

function makePlan({ startDate, weeks, runDaysPerWeek, sec5k, targetHM }) {
  const paces = estimatePacesFrom5K(sec5k);
  const blocks = splitWeeks(weeks);
  const plan = [];
  const start = new Date(startDate);

  // 依週期大致安排：
  // 每週結構：1 長距離(L), 1 閾值(T) 或 間歇(I/R)，其餘 EASY 或 恢復跑
  // runDaysPerWeek = 3~6
  const blockAssign = [];
  for (let b of ["base", "build", "peak", "taper"]) {
    for (let i = 0; i < blocks[b]; i++) blockAssign.push(b);
  }

  const dayNames = ["一", "二", "三", "四", "五", "六", "日"]; // 週一開頭

  for (let w = 0; w < weeks; w++) {
    const block = blockAssign[w];
    const weekStart = new Date(start);
    weekStart.setDate(start.getDate() + w * 7);

    const sessions = [];
    const intensityDays = Math.min(2, Math.max(1, Math.round(runDaysPerWeek / 3)));
    const easyDays = runDaysPerWeek - intensityDays - 1; // -1 是長距離

    // 簡化：固定把課表安排在 週二、週四做強度、週日長距離，其他 EASY
    // 若天數不足就砍掉部分 EASY
    const template = [
      { day: 1, type: "EASY" }, // 週一
      { day: 2, type: "QUALITY1" },
      { day: 3, type: "EASY" },
      { day: 4, type: "QUALITY2" },
      { day: 5, type: "EASY" },
      { day: 6, type: "OFF" },
      { day: 7, type: "LONG" },
    ];

    // 決定當週該保留幾個 EASY
    let keptEasy = 0;
    for (let t of template) {
      if (t.type === "EASY" && keptEasy >= easyDays) t.type = "OFF";
      if (t.type === "EASY") keptEasy++;
    }

    // 生成每日任務
    template.forEach((t) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + (t.day - 1));

      if (t.type === "OFF") {
        sessions.push({ date: d, label: `休息 / 交叉訓練`, detail: `可做核心/伸展` });
        return;
      }

      if (t.type === "LONG") {
        // 長距離公里數：由 10km 漸進到 16~22km，taper 期下降
        let longKm = 10 + Math.min(12, Math.floor(w * 0.8));
        if (block === "taper") longKm = Math.max(12, Math.floor(longKm * 0.7));
        const pace = paces ? mPerKm(paces.long) : "舒適對話配速";
        sessions.push({ date: d, label: `長距離 ${longKm}km`, detail: `配速 ~ ${pace}` });
        return;
      }

      if (t.type === "QUALITY1" || t.type === "QUALITY2") {
        // Base: 閾值短間歇 / 漸進跑；Build: 閾值 → 間歇；Peak: 目標配速組合；Taper: 降量維持銳度
        let workout = null;
        if (block === "base") {
          const T = paces ? mPerKm(paces.threshold) : "T 配速";
          workout = `T 閾值 4×5′ (${T})，每次慢跑 2′ 回復`;
        } else if (block === "build") {
          const I = paces ? mPerKm(paces.interval) : "I 配速";
          workout = `I 間歇 6×800m (${I})，每次 400m 慢跑回復`;
        } else if (block === "peak") {
          const M = paces ? mPerKm(paces.marathon) : "M 配速";
          workout = `特異性：2×5km @ ${M} ~ HM 目標配速，中間慢跑 1km`;
        } else {
          const T = paces ? mPerKm(paces.threshold) : "T 配速";
          workout = `減量：T 3×6′ (${T})，總量降低，保持感覺`;
        }
        sessions.push({ date: d, label: `品質課`, detail: workout });
        return;
      }

      if (t.type === "EASY") {
        const km = 6 + Math.min(6, Math.floor(w / 2));
        const pace = paces ? mPerKm(paces.easy) : "E 配速";
        sessions.push({ date: d, label: `Easy ${km}km`, detail: `放鬆 ~ ${pace}` });
      }
    });

    plan.push({ weekIndex: w + 1, block, sessions });
  }

  return { plan, paces };
}

// ===== 本體 =====
export default function HalfMarathonPlanner() {
  const [sec5k, setSec5k] = useState(25 * 60); // 預設 25:00
  const [hmTarget, setHmTarget] = useState(90 * 60); // 預設 1:30:00
  const [weeks, setWeeks] = useState(12);
  const [runDaysPerWeek, setRunDaysPerWeek] = useState(5);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0,10));

  const [savedKey, setSavedKey] = useState("");
  const [savedList, setSavedList] = useState([]);

  useEffect(() => {
    const keys = JSON.parse(localStorage.getItem("hm-plans-keys") || "[]");
    setSavedList(keys);
  }, []);

  const paces = useMemo(() => estimatePacesFrom5K(sec5k), [sec5k]);
  const { plan } = useMemo(() => makePlan({ startDate, weeks, runDaysPerWeek, sec5k, targetHM: hmTarget }), [startDate, weeks, runDaysPerWeek, sec5k, hmTarget]);

  function onChange5K(e) {
    const s = timeToSeconds(e.target.value.trim());
    if (s != null) setSec5k(s);
  }
  function onChangeHM(e) {
    const s = timeToSeconds(e.target.value.trim());
    if (s != null) setHmTarget(s);
  }

  function savePlan() {
    const key = savedKey || `plan-${new Date().toISOString().slice(0,16).replace(/[:T]/g, "")}`;
    const data = { startDate, weeks, runDaysPerWeek, sec5k, hmTarget, plan };
    localStorage.setItem(key, JSON.stringify(data));
    const keys = new Set(JSON.parse(localStorage.getItem("hm-plans-keys") || "[]"));
    keys.add(key);
    localStorage.setItem("hm-plans-keys", JSON.stringify([...keys]));
    setSavedKey(key);
    setSavedList([...keys]);
  }

  function loadPlan(key) {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const d = JSON.parse(raw);
    setStartDate(d.startDate); setWeeks(d.weeks); setRunDaysPerWeek(d.runDaysPerWeek);
    setSec5k(d.sec5k); setHmTarget(d.hmTarget);
  }

  function exportCSV() {
    const rows = [["Week","Date","Day","Block","Label","Detail"]];
    plan.forEach((w) => {
      w.sessions.forEach((s) => {
        const d = s.date.toISOString().slice(0,10);
        rows.push([w.weekIndex, d, "一二三四五六日"[(s.date.getDay()+6)%7], w.block, s.label, s.detail]);
      });
    });
    const csv = rows.map(r => r.map(x => `"${String(x).replaceAll('"','""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "half_marathon_plan.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold">半馬訓練課表小幫手 🏃‍♂️</h1>
        <p className="text-gray-600 mt-1">依 5K 成績與目標，自動產生期化課表（Base→Build→Peak→Taper）</p>
      </header>

      <main className="max-w-5xl mx-auto px-4 pb-24">
        {/* 控制面板 */}
        <section className="grid md:grid-cols-2 gap-4 bg-white rounded-2xl shadow p-4 md:p-6">
          <div className="space-y-3">
            <label className="block">
              <span className="text-sm text-gray-600">目前 5K 成績 (mm:ss)</span>
              <input defaultValue="25:00" onBlur={onChange5K}
                     className="mt-1 w-full border rounded-xl px-3 py-2 outline-none focus:ring" placeholder="例如 24:30" />
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">目標 半馬 (hh:mm:ss)</span>
              <input defaultValue="1:30:00" onBlur={onChangeHM}
                     className="mt-1 w-full border rounded-xl px-3 py-2 outline-none focus:ring" placeholder="例如 1:45:00" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm text-gray-600">總週數</span>
                <input type="number" min={8} max={20} value={weeks}
                       onChange={(e)=>setWeeks(Number(e.target.value))}
                       className="mt-1 w-full border rounded-xl px-3 py-2 outline-none focus:ring" />
              </label>
              <label className="block">
                <span className="text-sm text-gray-600">每週跑幾天</span>
                <input type="number" min={3} max={6} value={runDaysPerWeek}
                       onChange={(e)=>setRunDaysPerWeek(Number(e.target.value))}
                       className="mt-1 w-full border rounded-xl px-3 py-2 outline-none focus:ring" />
              </label>
            </div>
            <label className="block">
              <span className="text-sm text-gray-600">開始日期</span>
              <input type="date" value={startDate}
                     onChange={(e)=>setStartDate(e.target.value)}
                     className="mt-1 w-full border rounded-xl px-3 py-2 outline-none focus:ring" />
            </label>
            <div className="flex items-center gap-2 pt-2">
              <input value={savedKey} onChange={(e)=>setSavedKey(e.target.value)}
                     className="flex-1 border rounded-xl px-3 py-2 outline-none focus:ring" placeholder="儲存鍵名（可自訂）" />
              <button onClick={savePlan} className="px-4 py-2 rounded-xl bg-black text-white">儲存</button>
              <button onClick={exportCSV} className="px-4 py-2 rounded-xl border">匯出 CSV</button>
            </div>
            {savedList.length>0 && (
              <div className="flex flex-wrap gap-2 text-sm pt-2">
                {savedList.map((k)=> (
                  <button key={k} onClick={()=>loadPlan(k)} className="px-3 py-1 rounded-full border hover:bg-gray-50">載入：{k}</button>
                ))}
              </div>
            )}
          </div>

          {/* 配速卡片 */}
          <div className="grid sm:grid-cols-2 gap-3 content-start">
            <div className="col-span-2">
              <div className="p-4 rounded-xl bg-gray-100">
                <div className="text-sm text-gray-600">估算配速（僅供參考）</div>
                {paces ? (
                  <ul className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <li className="flex justify-between border rounded-lg px-3 py-2"><span>Easy</span><span>{mPerKm(paces.easy)}</span></li>
                    <li className="flex justify-between border rounded-lg px-3 py-2"><span>Long</span><span>{mPerKm(paces.long)}</span></li>
                    <li className="flex justify-between border rounded-lg px-3 py-2"><span>Threshold (T)</span><span>{mPerKm(paces.threshold)}</span></li>
                    <li className="flex justify-between border rounded-lg px-3 py-2"><span>Interval (I)</span><span>{mPerKm(paces.interval)}</span></li>
                    <li className="flex justify-between border rounded-lg px-3 py-2"><span>Marathon (M)</span><span>{mPerKm(paces.marathon)}</span></li>
                    <li className="flex justify-between border rounded-lg px-3 py-2"><span>Repeat (R)</span><span>{mPerKm(paces.repeat)}</span></li>
                  </ul>
                ) : (
                  <div className="text-sm text-gray-500">請提供有效的 5K 成績以估配速</div>
                )}
              </div>
            </div>
            <div className="col-span-2 text-xs text-gray-500">
              * 以上配速為粗略估算，請依個人體感調整；不適時請減量、休息。
            </div>
          </div>
        </section>

        {/* 課表 */}
        <section className="mt-8">
          {plan.map((w) => (
            <div key={w.weekIndex} className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="text-lg font-semibold">第 {w.weekIndex} 週</div>
                <span className="px-2 py-0.5 text-xs rounded-full bg-gray-900 text-white">{w.block.toUpperCase()}</span>
              </div>
              <div className="grid md:grid-cols-3 gap-3">
                {w.sessions.map((s, idx) => (
                  <div key={idx} className="border rounded-xl p-3 bg-white">
                    <div className="text-sm text-gray-500">{s.date.toISOString().slice(0,10)}（{"一二三四五六日"[(s.date.getDay()+6)%7]}）</div>
                    <div className="font-medium mt-1">{s.label}</div>
                    <div className="text-sm text-gray-600 mt-1">{s.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      </main>

      <footer className="text-center text-xs text-gray-500 py-8">ⓘ 提醒：請依身體狀況彈性微調，必要時諮詢專業教練/醫師。</footer>
    </div>
  );
}
