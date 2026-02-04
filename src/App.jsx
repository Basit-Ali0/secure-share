import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import SharePage from './pages/SharePage'

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/share/:fileId" element={<SharePage />} />
            </Routes>
        </BrowserRouter>
    )
}

export default App
