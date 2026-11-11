/*
 * firebase-config.js — 網站共用的 Firebase 設定
 *
 * 這些值不是密碼：Firebase 網頁設定本來就會公開在網頁中，
 * 資料安全由 firebase/database.rules.json 的資料庫規則負責。
 * 欄位留空時，對應功能（統計、登入留言）會自動停用。
 */
window.LAB_FIREBASE = {
  databaseURL: 'https://astro-ni-physics-lab-default-rtdb.asia-southeast1.firebasedatabase.app',
  // 以下在 Firebase 主控台「專案設定 → 你的應用程式 → 網頁應用程式」取得，供 Google 登入與留言使用
  apiKey: 'AIzaSyAI4AALCl-JO-j23vOGmS3lazDT-WCzhMw',
  authDomain: 'astro-ni-physics-lab.firebaseapp.com',
  projectId: 'astro-ni-physics-lab',
  appId: '1:608190591554:web:1f8b50bb47cc0bb476f3db'
};
