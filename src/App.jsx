import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Header from './components/Navigation/Header'
import HomePage from './pages/HomePage'
import SharePage from './pages/SharePage'
import './App.css'

function App() {
    return (
        <BrowserRouter>
            <div className="min-h-screen gradient-bg">
                <Header />
                <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/share/:fileId" element={<SharePage />} />
                </Routes>
            </div>
        </BrowserRouter>
    )
}

export default App
