# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
# 🏃‍♂️ Half Marathon Planner (RUN_project)

一個使用 **React + Vite + TailwindCSS** 開發的半馬訓練課表小幫手。  
輸入目前 5K 成績、目標半馬時間、週數與每週跑量日數，就能自動產生期化課表（Base → Build → Peak → Taper），並支援本地儲存與 CSV 匯出。

## ✨ 功能
- 📅 自動產生 8 ~ 20 週半馬課表
- 🎯 依 5K 成績估算訓練配速 (E/M/T/I/R)
- 💾 儲存 / 載入訓練計畫（使用 localStorage）
- 📤 匯出 CSV，方便分享或列印
- 🎨 使用 TailwindCSS 提供簡潔 UI

## 🛠️ 開發環境
- [Vite](https://vitejs.dev/) (React)
- [TailwindCSS](https://tailwindcss.com/)
- Node.js 20+

## 🚀 開發方式
```bash
# 安裝相依套件
npm install

# 啟動開發伺服器
npm run dev
