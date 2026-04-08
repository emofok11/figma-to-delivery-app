import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// 注册默认模版
import './templates/killIconTemplate'
import './templates/listTableTemplate'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)