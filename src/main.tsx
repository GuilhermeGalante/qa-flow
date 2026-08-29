import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter/wght.css'
import './index.css'
import App from './App.tsx'
import { createWebComposition } from './platform/web/createWebComposition.ts'
import { configureQaStore } from './store/useQaStore.ts'

configureQaStore(createWebComposition().store)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
