import { NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import Home from './pages/Home'
import Vehicles from './pages/Vehicles'
import VehicleForm from './pages/VehicleForm'
import Drivers from './pages/Drivers'
import DriverForm from './pages/DriverForm'
import Expenses from './pages/Expenses'
import ExpenseForm from './pages/ExpenseForm'
import Settings from './pages/Settings'

const NAV = [
  { to: '/', label: 'Início', icon: '🏠', end: true },
  { to: '/despesas', label: 'Despesas', icon: '💰' },
  { to: '/veiculos', label: 'Veículos', icon: '🚗' },
  { to: '/condutores', label: 'Condutores', icon: '🪪' },
  { to: '/ajustes', label: 'Ajustes', icon: '⚙️' },
]

export default function App() {
  const nav = useNavigate()
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">🚗 Controle de Veículos</div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className="navlink">
            <span className="navicon">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
        <button className="btn primary block" onClick={() => nav('/despesas/nova')}>
          + Nova despesa
        </button>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/despesas" element={<Expenses />} />
          <Route path="/despesas/nova" element={<ExpenseForm />} />
          <Route path="/despesas/:id" element={<ExpenseForm />} />
          <Route path="/veiculos" element={<Vehicles />} />
          <Route path="/veiculos/novo" element={<VehicleForm />} />
          <Route path="/veiculos/:id" element={<VehicleForm />} />
          <Route path="/condutores" element={<Drivers />} />
          <Route path="/condutores/novo" element={<DriverForm />} />
          <Route path="/condutores/:id" element={<DriverForm />} />
          <Route path="/ajustes" element={<Settings />} />
        </Routes>
      </main>
      <nav className="tabbar">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className="tab">
            <span className="tabicon">{n.icon}</span>
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
