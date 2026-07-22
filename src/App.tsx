import { useState, useEffect, useCallback, useRef } from 'react'

// ── Types ───────────────────────────────────────────────────────────────────

type AgeGroup = 'U7' | 'U8' | 'U9' | 'U10' | 'U11' | 'U12' | 'U14' | 'U16' | 'U18' | 'Senioren'
type View = 'setup' | 'game' | 'history'

interface Player {
  id: string
  name: string
  number: number
}

interface PositionSlot {
  posId: string
  playerId: string | null
}

interface BenchEntry {
  playerId: string
  sinceGameSec: number
}

interface SubRecord {
  gameTimeSec: number
  playerInId: string
  playerOutId: string
}

interface SavedGame {
  id: string
  date: string
  club: string
  team: string
  ageGroup: AgeGroup
  opponent: string
  homeAway: 'Thuis' | 'Uit'
  squad: Player[]
  slots: PositionSlot[]
  subs: SubRecord[]
  notes: string
  result: string
  finalTime: number
}

interface GameParams {
  club: string
  team: string
  ageGroup: AgeGroup
  opponent: string
  homeAway: 'Thuis' | 'Uit'
  squad: Player[]
}

// ── Dutch Clubs ─────────────────────────────────────────────────────────────

const DUTCH_CLUBS = [
  'Almere HC', 'Amstelveense HC', 'Breda HC', 'HC Alkmaar', 'HC Amersfoort',
  'HC Amsterdam', 'HC Apeldoorn', 'HC Arnhem', 'HC Assen', 'HC Barendrecht',
  'HC Bergen op Zoom', 'HC Bloemendaal', 'HC Boxmeer', 'HC Delft', 'HC Den Bosch',
  'HC Deventer', 'HC Dordrecht', 'HC Eindhoven', 'HC Emmen', 'HC Enschede',
  'HC Geldrop', 'HC Goes', 'HC Gouda', 'HC Groningen', 'HC Haarlem',
  'HC Heemstede', 'HC Hengelo', 'HC Hilversum', 'HC Hoorn', 'HC Hoofddorp',
  'HC Hurley', 'HC Leeuwarden', 'HC Leiden', 'HC Maastricht', 'HC Meppel',
  'HC Middelburg', 'HC Naarden', 'HC Nijmegen', 'HC Roosendaal', 'HC Rotterdam',
  'HC Scheveningen', 'HC Sittard', 'HC Terneuzen', 'HC Tilburg', 'HC Utrecht',
  'HC Venlo', 'HC Vlaardingen', 'HC Vlissingen', 'HC Wassenaar', 'HC Weert',
  'HC Woerden', 'HC Zaandam', 'HC Zeist', 'HC Zwolle', 'HGC',
  'Kampong', 'Klein Zwitserland', 'Laren HC', 'MHC Arnhem', 'Oranje-Rood',
  'Pinoké', 'Push', 'Rood-Wit', 'SC Muiden', 'SCHC', 'Voordaan HC',
].sort()

// ── Age group config ─────────────────────────────────────────────────────────

const AGE_CONFIG: Record<AgeGroup, { total: number; field: number; label: string; dual?: boolean }> = {
  U7:      { total: 6,  field: 6,  label: 'U7 — 3 tegen 3 (KNHB O7), 2 velden', dual: true },
  U8:      { total: 6,  field: 6,  label: 'U8 — 3 tegen 3 (KNHB O8), 2 velden', dual: true },
  U9:      { total: 6,  field: 5,  label: 'U9 — 6 spelers (5 veld + 1 keeper, KNHB O9 6-tegen-6)' },
  U10:     { total: 8,  field: 7,  label: 'U10 — 8 spelers (7 veld + 1 keeper, KNHB O10 8-tegen-8, half veld)' },
  U11:     { total: 9,  field: 8,  label: 'U11 — 9 spelers (8 veld + 1 keeper)' },
  U12:     { total: 11, field: 10, label: 'U12 — 11 spelers (10 veld + 1 keeper)' },
  U14:     { total: 11, field: 10, label: 'U14 — 11 spelers (10 veld + 1 keeper)' },
  U16:     { total: 11, field: 10, label: 'U16 — 11 spelers (10 veld + 1 keeper)' },
  U18:     { total: 11, field: 10, label: 'U18 — 11 spelers (10 veld + 1 keeper)' },
  Senioren:{ total: 11, field: 10, label: 'Senioren — 11 spelers (10 veld + 1 keeper)' },
}

// ── Field positions ──────────────────────────────────────────────────────────
// x/y are % of the SVG container (0–100)
// Standard field SVG viewBox="0 0 62 97", dual viewBox="0 0 140 97"

// U7/U8 dual field — left field center x≈22.5%, right≈77.5%
const POS_DUAL = [
  { id: 'a_b', label: 'VD', x: 22.5, y: 82 },
  { id: 'a_m', label: 'MV', x: 22.5, y: 50 },
  { id: 'a_f', label: 'ST', x: 22.5, y: 18 },
  { id: 'b_b', label: 'VD', x: 77.5, y: 82 },
  { id: 'b_m', label: 'MV', x: 77.5, y: 50 },
  { id: 'b_f', label: 'ST', x: 77.5, y: 18 },
]

// U9 (KNHB O9, 6-tegen-6): GK + 2-2-1
const POS_U9 = [
  { id: 'gk', label: 'K',  x: 50, y: 86 },
  { id: 'd1', label: 'RB', x: 28, y: 66 }, { id: 'd2', label: 'LB', x: 72, y: 66 },
  { id: 'm1', label: 'RM', x: 28, y: 40 }, { id: 'm2', label: 'LM', x: 72, y: 40 },
  { id: 'f1', label: 'ST', x: 50, y: 20 },
]

// U10: GK + 2-3-2
const POS_U10 = [
  { id: 'gk', label: 'K',  x: 50, y: 86 },
  { id: 'd1', label: 'RB', x: 28, y: 70 }, { id: 'd2', label: 'LB', x: 72, y: 70 },
  { id: 'm1', label: 'RH', x: 16, y: 50 }, { id: 'm2', label: 'CH', x: 50, y: 50 }, { id: 'm3', label: 'LH', x: 84, y: 50 },
  { id: 'f1', label: 'RS', x: 30, y: 26 }, { id: 'f2', label: 'LS', x: 70, y: 26 },
]

// U11: GK + 2-3-3
const POS_U11 = [
  { id: 'gk', label: 'K',  x: 50, y: 86 },
  { id: 'd1', label: 'RB', x: 28, y: 70 }, { id: 'd2', label: 'LB', x: 72, y: 70 },
  { id: 'm1', label: 'RH', x: 16, y: 50 }, { id: 'm2', label: 'MH', x: 50, y: 50 }, { id: 'm3', label: 'LH', x: 84, y: 50 },
  { id: 'f1', label: 'RW', x: 22, y: 28 }, { id: 'f2', label: 'ST', x: 50, y: 21 }, { id: 'f3', label: 'LW', x: 78, y: 28 },
]

// U12+: GK + 4-3-3
const POS_11 = [
  { id: 'gk', label: 'K',   x: 50, y: 86 },
  { id: 'd1', label: 'RB',  x: 15, y: 70 }, { id: 'd2', label: 'CB', x: 38, y: 70 }, { id: 'd3', label: 'CB', x: 62, y: 70 }, { id: 'd4', label: 'LB', x: 85, y: 70 },
  { id: 'm1', label: 'RH',  x: 22, y: 50 }, { id: 'm2', label: 'CH', x: 50, y: 50 }, { id: 'm3', label: 'LH', x: 78, y: 50 },
  { id: 'f1', label: 'RW',  x: 22, y: 27 }, { id: 'f2', label: 'ST', x: 50, y: 20 }, { id: 'f3', label: 'LW', x: 78, y: 27 },
]

function getPos(ag: AgeGroup) {
  if (ag === 'U7' || ag === 'U8') return POS_DUAL
  if (ag === 'U9')  return POS_U9
  if (ag === 'U10') return POS_U10
  if (ag === 'U11') return POS_U11
  return POS_11
}

// ── Utils ────────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 11)
const p2 = (n: number) => n.toString().padStart(2, '0')
const fmtSec = (s: number) => `${p2(Math.floor(s / 60))}:${p2(s % 60)}`
const todayStr = () => new Date().toISOString().slice(0, 10)

function useLS<T>(key: string, init: T) {
  const [v, sv] = useState<T>(() => {
    try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? init } catch { return init }
  })
  const set = useCallback((u: T | ((p: T) => T)) => {
    sv(p => {
      const n = typeof u === 'function' ? (u as (x: T) => T)(p) : u
      localStorage.setItem(key, JSON.stringify(n))
      return n
    })
  }, [key])
  return [v, set] as const
}

function benchColor(sec: number) {
  if (sec < 300) return '#16A34A'
  if (sec < 600) return '#D97706'
  if (sec < 900) return '#EA580C'
  return '#DC2626'
}

// ── SC Muiden Logo ───────────────────────────────────────────────────────────

function SCMuidenLogo({ size = 48 }: { size?: number }) {
  return (
    <img src="/sc-muiden-logo.jpg" alt="SC Muiden" width={size} height={size}
      style={{ width: size, height: size, objectFit: 'contain' }} />
  )
}

// ── Field Hockey Field SVG (standard portrait) ───────────────────────────────
// viewBox="0 0 62 97" — field lines from y=4.5 to y=92.5, goals at y=0-4.5 and y=92.5-97

function FieldSVG() {
  // D-circle radius: 14.63m / 91.4m * 88 SVG units ≈ 14.08
  const dR = 14.08
  const cx = 31        // horizontal center
  const topY = 4.5     // top backline
  const botY = 92.5    // bottom backline
  const goalW = 9.6    // goal width in SVG units (3.66m / 55m * 60 * 2.4 ≈ 9.6... rough)
  const goalX1 = cx - goalW / 2
  const goalX2 = cx + goalW / 2
  // 23m lines: 22.9/91.4 * 88 ≈ 22 units from backline
  const top23 = topY + 22
  const bot23 = botY - 22
  // Penalty spots: 6.4/91.4 * 88 ≈ 6.16 from backline
  const topPen = topY + 6.16
  const botPen = botY - 6.16

  const stripes = Array.from({ length: 14 }, (_, i) => (
    <rect key={i} x="0" y={i * 6.93} width="62" height="6.93"
      fill={i % 2 === 0 ? '#1C6B38' : '#217040'} />
  ))

  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 62 97" preserveAspectRatio="xMidYMid meet">
      {stripes}

      {/* Goals (behind backlines) */}
      <rect x={goalX1} y="1" width={goalW} height="3.8" rx="0.3"
        fill="#14472A" stroke="white" strokeWidth="0.7" strokeOpacity="0.9"/>
      <rect x={goalX1} y={botY} width={goalW} height="3.8" rx="0.3"
        fill="#14472A" stroke="white" strokeWidth="0.7" strokeOpacity="0.9"/>

      {/* Field boundary */}
      <rect x="1" y={topY} width="60" height={botY - topY}
        fill="none" stroke="white" strokeWidth="0.9" strokeOpacity="0.9"/>

      {/* 23m lines */}
      <line x1="1" y1={top23} x2="61" y2={top23}
        stroke="white" strokeWidth="0.55" strokeOpacity="0.65"/>
      <line x1="1" y1={bot23} x2="61" y2={bot23}
        stroke="white" strokeWidth="0.55" strokeOpacity="0.65"/>

      {/* Center line */}
      <line x1="1" y1="48.5" x2="61" y2="48.5"
        stroke="white" strokeWidth="0.65" strokeOpacity="0.7"/>

      {/* Shooting circles (D) — semicircles projecting INTO the field */}
      {/* Top D: arc from (cx-dR, topY) to (cx+dR, topY) bowing downward */}
      <path d={`M ${cx - dR} ${topY} A ${dR} ${dR} 0 0 1 ${cx + dR} ${topY}`}
        fill="none" stroke="white" strokeWidth="0.8" strokeOpacity="0.85"/>
      {/* Bottom D: arc from (cx-dR, botY) to (cx+dR, botY) bowing upward */}
      <path d={`M ${cx - dR} ${botY} A ${dR} ${dR} 0 0 0 ${cx + dR} ${botY}`}
        fill="none" stroke="white" strokeWidth="0.8" strokeOpacity="0.85"/>

      {/* Penalty spots */}
      <circle cx={cx} cy={topPen} r="0.65" fill="white" fillOpacity="0.8"/>
      <circle cx={cx} cy={botPen} r="0.65" fill="white" fillOpacity="0.8"/>

      {/* Center spot */}
      <circle cx={cx} cy="48.5" r="0.5" fill="white" fillOpacity="0.55"/>

      {/* Corner arcs (r=0.9m, struck from corner flags) */}
      <path d={`M 1.9 ${topY} A 0.9 0.9 0 0 1 1 ${topY + 0.9}`}
        fill="none" stroke="white" strokeWidth="0.55" strokeOpacity="0.6"/>
      <path d={`M 61 ${topY + 0.9} A 0.9 0.9 0 0 1 60.1 ${topY}`}
        fill="none" stroke="white" strokeWidth="0.55" strokeOpacity="0.6"/>
      <path d={`M 1 ${botY - 0.9} A 0.9 0.9 0 0 1 1.9 ${botY}`}
        fill="none" stroke="white" strokeWidth="0.55" strokeOpacity="0.6"/>
      <path d={`M 60.1 ${botY} A 0.9 0.9 0 0 1 61 ${botY - 0.9}`}
        fill="none" stroke="white" strokeWidth="0.55" strokeOpacity="0.6"/>
    </svg>
  )
}

// ── Dual Field Hockey Field SVG (U7/U8, landscape) ───────────────────────────
// viewBox="0 0 140 97" — two mini-fields side by side

function DualFieldSVG() {
  const gy = 4.5
  const gBot = 92.5
  const fH = gBot - gy       // field height = 88
  const fW = 59              // each field width
  const gap = 18
  const aX = 2               // field A left edge
  const bX = aX + fW + gap   // field B left edge = 79
  const aCx = aX + fW / 2    // field A center x = 31.5
  const bCx = bX + fW / 2    // field B center x = 108.5
  const dR = 10              // D radius (smaller for mini-field)
  const goalW = 9
  const centerY = gy + fH / 2

  const stripes = Array.from({ length: 14 }, (_, i) => (
    <rect key={i} x="0" y={i * 6.93} width="140" height="6.93"
      fill={i % 2 === 0 ? '#1C6B38' : '#217040'} />
  ))

  const miniField = (x: number, cx: number, label: string) => (
    <g key={label}>
      {/* Goals */}
      <rect x={cx - goalW / 2} y="1" width={goalW} height="3.8" rx="0.3"
        fill="#14472A" stroke="white" strokeWidth="0.7" strokeOpacity="0.9"/>
      <rect x={cx - goalW / 2} y={gBot} width={goalW} height="3.8" rx="0.3"
        fill="#14472A" stroke="white" strokeWidth="0.7" strokeOpacity="0.9"/>
      {/* Boundary */}
      <rect x={x} y={gy} width={fW} height={fH}
        fill="none" stroke="white" strokeWidth="0.85" strokeOpacity="0.9"/>
      {/* Center line */}
      <line x1={x} y1={centerY} x2={x + fW} y2={centerY}
        stroke="white" strokeWidth="0.55" strokeOpacity="0.6"/>
      {/* D circles */}
      <path d={`M ${cx - dR} ${gy} A ${dR} ${dR} 0 0 1 ${cx + dR} ${gy}`}
        fill="none" stroke="white" strokeWidth="0.75" strokeOpacity="0.85"/>
      <path d={`M ${cx - dR} ${gBot} A ${dR} ${dR} 0 0 0 ${cx + dR} ${gBot}`}
        fill="none" stroke="white" strokeWidth="0.75" strokeOpacity="0.85"/>
      {/* Penalty spots */}
      <circle cx={cx} cy={gy + 5.5} r="0.6" fill="white" fillOpacity="0.75"/>
      <circle cx={cx} cy={gBot - 5.5} r="0.6" fill="white" fillOpacity="0.75"/>
      {/* Field label */}
      <text x={cx} y="96.5" textAnchor="middle" fill="white" fontSize="5.5"
        fontWeight="800" fillOpacity="0.9" fontFamily="'Barlow Condensed',sans-serif"
        letterSpacing="1">{label}</text>
    </g>
  )

  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 140 97"
      preserveAspectRatio="xMidYMid meet">
      {stripes}
      {/* Gap between fields */}
      <rect x={aX + fW} y="0" width={gap} height="97" fill="#173523" fillOpacity="0.7"/>
      {miniField(aX, aCx, 'VELD A')}
      {miniField(bX, bCx, 'VELD B')}
    </svg>
  )
}

// ── Field View ───────────────────────────────────────────────────────────────

interface FieldViewProps {
  ageGroup: AgeGroup
  slots: PositionSlot[]
  squad: Player[]
  selected: { type: 'field'; posId: string } | { type: 'bench'; playerId: string } | null
  onFieldClick: (posId: string) => void
  onPositionDrop: (posId: string, dragType: string, dragId: string) => void
}

function FieldView({ ageGroup, slots, squad, selected, onFieldClick, onPositionDrop }: FieldViewProps) {
  const isDual = ageGroup === 'U7' || ageGroup === 'U8'
  const positions = getPos(ageGroup)
  const [dragOverPos, setDragOverPos] = useState<string | null>(null)
  const getPlayer = (id: string | null) => id ? squad.find(p => p.id === id) ?? null : null

  return (
    <div
      className="relative w-full"
      style={{ aspectRatio: isDual ? '140/97' : '62/97', maxHeight: '100%' }}>
      {isDual ? <DualFieldSVG /> : <FieldSVG />}

      {positions.map(pos => {
        const slot = slots.find(s => s.posId === pos.id)!
        const player = getPlayer(slot.playerId)
        const isFieldSel = selected?.type === 'field' && selected.posId === pos.id
        const isBenchSel = selected?.type === 'bench'
        const isDragTarget = dragOverPos === pos.id
        const isGK = pos.id === 'gk'

        return (
          <div
            key={pos.id}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer select-none"
            style={{ left: `${pos.x}%`, top: `${pos.y}%`, zIndex: 10 }}
            draggable={!!player}
            onDragStart={e => {
              e.dataTransfer.setData('type', 'field')
              e.dataTransfer.setData('id', pos.id)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={e => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setDragOverPos(pos.id)
            }}
            onDragLeave={() => setDragOverPos(null)}
            onDrop={e => {
              e.preventDefault()
              setDragOverPos(null)
              const type = e.dataTransfer.getData('type')
              const id = e.dataTransfer.getData('id')
              if (id !== pos.id) onPositionDrop(pos.id, type, id)
            }}
            onClick={e => { e.stopPropagation(); onFieldClick(pos.id) }}>
            <div
              style={{
                width: player ? '46px' : '36px',
                height: player ? '46px' : '36px',
                background: isGK ? '#FBBF24' : player ? '#fff' : 'rgba(255,255,255,0.18)',
                border: isDragTarget
                  ? '2.5px solid #86EFAC'
                  : isFieldSel
                    ? '2.5px solid #fff'
                    : isBenchSel && !player
                      ? '2px dashed #86EFAC'
                      : player
                        ? '2px solid rgba(255,255,255,0.85)'
                        : '1.5px dashed rgba(255,255,255,0.45)',
                borderRadius: '50%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: isFieldSel
                  ? '0 0 0 3px rgba(26,63,171,0.7), 0 3px 12px rgba(0,0,0,0.4)'
                  : isDragTarget
                    ? '0 0 0 3px rgba(134,239,172,0.6), 0 3px 12px rgba(0,0,0,0.3)'
                    : player
                      ? '0 2px 8px rgba(0,0,0,0.3)'
                      : 'none',
                transform: isFieldSel ? 'scale(1.12)' : isDragTarget ? 'scale(1.08)' : 'scale(1)',
                transition: 'transform 0.1s, box-shadow 0.1s',
              }}>
              {player ? (
                <>
                  <span style={{ fontSize: '12px', fontWeight: 800, lineHeight: 1, color: '#111' }}>
                    {player.number}
                  </span>
                  <span style={{ fontSize: '8px', fontWeight: 600, color: '#333', marginTop: '1px', maxWidth: '42px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 2px' }}>
                    {player.name.split(' ')[0]}
                  </span>
                </>
              ) : (
                <span style={{ fontSize: '8px', fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>
                  {pos.label}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Setup View ───────────────────────────────────────────────────────────────

function SetupView({ onStart, onHistory, gameCount }: {
  onStart: (p: GameParams) => void
  onHistory: () => void
  gameCount: number
}) {
  const [club, setClub] = useLS('fh_club', 'SC Muiden')
  const [team, setTeam] = useLS('fh_team', '')
  const [ageGroup, setAgeGroup] = useLS<AgeGroup>('fh_age', 'U12')
  const [opponent, setOpponent] = useState('')
  const [homeAway, setHomeAway] = useState<'Thuis' | 'Uit'>('Thuis')
  const [squad, setSquad] = useLS<Player[]>('fh_squad', [])
  const [newName, setNewName] = useState('')
  const [newNumber, setNewNumber] = useState('')
  const [clubSearch, setClubSearch] = useState(club)
  const [showList, setShowList] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editNum, setEditNum] = useState('')

  const filtered = DUTCH_CLUBS.filter(c => c.toLowerCase().includes(clubSearch.toLowerCase()))

  const addPlayer = () => {
    const name = newName.trim()
    const num = parseInt(newNumber)
    if (!name || isNaN(num) || num < 1 || num > 99) return
    setSquad(s => [...s, { id: uid(), name, number: num }])
    setNewName('')
    setNewNumber('')
  }

  const saveEdit = (id: string) => {
    const num = parseInt(editNum)
    if (!editName.trim() || isNaN(num)) return
    setSquad(s => s.map(p => p.id === id ? { ...p, name: editName.trim(), number: num } : p))
    setEditId(null)
  }

  const minPlayers = AGE_CONFIG[ageGroup].total
  const canStart = (club || clubSearch) && team && opponent && squad.length >= minPlayers

  const inputStyle = { border: '1.5px solid #D0DCFA', background: '#F8FAFF', outline: 'none' }

  return (
    <div className="min-h-screen" style={{ background: '#EEF3FF' }}>
      <header style={{ background: '#0D2B7A' }} className="text-white sticky top-0 z-20 shadow-lg">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SCMuidenLogo size={46} />
            <div>
              <h1 className="font-display font-bold uppercase leading-none" style={{ fontSize: '22px', letterSpacing: '0.08em' }}>
                SC Muiden
              </h1>
              <p className="text-xs leading-none mt-0.5" style={{ color: '#A8BEF0', letterSpacing: '0.12em' }}>
                HOCKEY TEAMMANAGER
              </p>
            </div>
          </div>
          <button onClick={onHistory}
            className="text-sm px-3 py-1.5 rounded-lg font-semibold"
            style={{ color: '#A8BEF0', border: '1px solid rgba(168,190,240,0.35)', background: 'rgba(255,255,255,0.08)' }}>
            {gameCount} wedstrijd{gameCount !== 1 ? 'en' : ''}
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">

        {/* Team config */}
        <section className="bg-white rounded-2xl p-6 space-y-5 shadow-sm" style={{ border: '1px solid #D0DCFA' }}>
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide" style={{ color: '#0D2B7A' }}>Team configuratie</h2>

          <div className="relative">
            <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: '#6B82B8', letterSpacing: '0.12em' }}>Club</label>
            <input className="w-full rounded-xl px-3 py-2.5 text-sm" style={inputStyle}
              value={clubSearch}
              onChange={e => { setClubSearch(e.target.value); setShowList(true) }}
              onFocus={() => setShowList(true)}
              onBlur={() => setTimeout(() => setShowList(false), 150)}
              placeholder="Zoek club…" />
            {showList && filtered.length > 0 && (
              <div className="absolute z-10 w-full bg-white rounded-xl shadow-xl mt-1 max-h-48 overflow-y-auto"
                style={{ border: '1px solid #D0DCFA' }}>
                {filtered.map(c => (
                  <button key={c} className="w-full text-left px-4 py-2.5 text-sm font-medium transition-colors"
                    style={{ color: '#1A2F6B' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#EEF3FF')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    onMouseDown={() => { setClub(c); setClubSearch(c); setShowList(false) }}>
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: '#6B82B8', letterSpacing: '0.12em' }}>Teamnaam</label>
            <input className="w-full rounded-xl px-3 py-2.5 text-sm" style={inputStyle}
              value={team} onChange={e => setTeam(e.target.value)}
              placeholder="bijv. D1, U12-1, JO14-2" />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: '#6B82B8', letterSpacing: '0.12em' }}>Leeftijdscategorie</label>
            <div className="grid grid-cols-5 gap-2">
              {(Object.keys(AGE_CONFIG) as AgeGroup[]).map(ag => (
                <button key={ag} onClick={() => setAgeGroup(ag)}
                  className="py-2 px-1 rounded-xl text-sm font-bold transition-all"
                  style={ageGroup === ag
                    ? { background: '#1A3FAB', color: '#fff', border: '1.5px solid #1A3FAB' }
                    : { background: '#F8FAFF', color: '#3B5299', border: '1.5px solid #D0DCFA' }}>
                  {ag}
                </button>
              ))}
            </div>
            <p className="text-xs mt-2 font-medium" style={{ color: '#7B90C8' }}>{AGE_CONFIG[ageGroup].label}</p>
          </div>
        </section>

        {/* Match */}
        <section className="bg-white rounded-2xl p-6 space-y-4 shadow-sm" style={{ border: '1px solid #D0DCFA' }}>
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide" style={{ color: '#0D2B7A' }}>Wedstrijd</h2>
          <div>
            <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: '#6B82B8', letterSpacing: '0.12em' }}>Tegenstander</label>
            <input className="w-full rounded-xl px-3 py-2.5 text-sm" style={inputStyle}
              value={opponent} onChange={e => setOpponent(e.target.value)}
              placeholder="Club tegenstander" />
          </div>
          <div className="flex gap-3">
            {(['Thuis', 'Uit'] as const).map(ha => (
              <button key={ha} onClick={() => setHomeAway(ha)}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all"
                style={homeAway === ha
                  ? { background: '#1A3FAB', color: '#fff', border: '1.5px solid #1A3FAB' }
                  : { background: '#F8FAFF', color: '#3B5299', border: '1.5px solid #D0DCFA' }}>
                {ha}
              </button>
            ))}
          </div>
        </section>

        {/* Squad */}
        <section className="bg-white rounded-2xl p-6 space-y-4 shadow-sm" style={{ border: '1px solid #D0DCFA' }}>
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-2xl font-bold uppercase tracking-wide" style={{ color: '#0D2B7A' }}>Selectie</h2>
            <span className="text-sm font-bold" style={{ color: squad.length >= minPlayers ? '#16A34A' : '#7B90C8' }}>
              {squad.length} / {minPlayers}+ spelers
            </span>
          </div>

          <div className="flex gap-2">
            <input type="number" min={1} max={99}
              className="w-16 rounded-xl px-2 py-2.5 text-sm text-center font-mono font-bold"
              style={{ ...inputStyle, color: '#1A3FAB' }}
              value={newNumber} onChange={e => setNewNumber(e.target.value)} placeholder="#" />
            <input className="flex-1 rounded-xl px-3 py-2.5 text-sm" style={inputStyle}
              value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Naam speler"
              onKeyDown={e => e.key === 'Enter' && addPlayer()} />
            <button onClick={addPlayer}
              className="px-4 py-2.5 rounded-xl font-bold text-white text-lg"
              style={{ background: '#1A3FAB' }}>+</button>
          </div>

          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {squad.length === 0 && (
              <p className="text-sm text-center py-6" style={{ color: '#A8BEF0' }}>Voeg spelers toe aan de selectie</p>
            )}
            {[...squad].sort((a, b) => a.number - b.number).map(p => (
              <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: '#F0F5FF', border: '1px solid #E4ECFE' }}>
                {editId === p.id ? (
                  <>
                    <input type="number" className="w-14 rounded-lg px-1.5 py-1 text-xs text-center font-mono font-bold"
                      style={{ border: '1px solid #D0DCFA', background: 'white' }}
                      value={editNum} onChange={e => setEditNum(e.target.value)} />
                    <input className="flex-1 rounded-lg px-2 py-1 text-sm"
                      style={{ border: '1px solid #D0DCFA', background: 'white' }}
                      value={editName} onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveEdit(p.id)} />
                    <button onClick={() => saveEdit(p.id)}
                      className="text-xs font-bold px-2 py-1 rounded-lg text-white" style={{ background: '#16A34A' }}>✓</button>
                    <button onClick={() => setEditId(null)}
                      className="text-xs px-2 py-1 rounded-lg" style={{ color: '#7B90C8' }}>✕</button>
                  </>
                ) : (
                  <>
                    <span className="font-mono text-sm font-bold w-8 text-center" style={{ color: '#1A3FAB' }}>#{p.number}</span>
                    <span className="flex-1 text-sm font-semibold" style={{ color: '#1A2F6B' }}>{p.name}</span>
                    <button onClick={() => { setEditId(p.id); setEditName(p.name); setEditNum(String(p.number)) }}
                      className="text-xs px-2 py-0.5 rounded-lg" style={{ color: '#A8BEF0' }}>✎</button>
                    <button onClick={() => setSquad(s => s.filter(x => x.id !== p.id))}
                      className="text-lg leading-none ml-1" style={{ color: '#C8D5F5' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#DC2626')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#C8D5F5')}>×</button>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>

        <button
          disabled={!canStart}
          onClick={() => onStart({ club: club || clubSearch, team, ageGroup, opponent, homeAway, squad })}
          className="w-full py-4 rounded-2xl font-display text-xl font-bold uppercase tracking-widest text-white shadow-lg"
          style={{ background: canStart ? '#1A3FAB' : '#B8C8F0', cursor: canStart ? 'pointer' : 'not-allowed' }}>
          Wedstrijd starten →
        </button>
        {!canStart && (
          <p className="text-xs text-center -mt-3" style={{ color: '#A8BEF0' }}>
            Vul alle velden in en voeg minimaal {minPlayers} spelers toe
          </p>
        )}
      </div>
    </div>
  )
}

// ── Game View ────────────────────────────────────────────────────────────────

function GameView({ club, team, ageGroup, opponent, homeAway, squad, onSave, onBack }: GameParams & {
  onSave: (g: SavedGame) => void
  onBack: () => void
}) {
  const isDual = ageGroup === 'U7' || ageGroup === 'U8'
  const positions = getPos(ageGroup)

  const [slots, setSlots] = useState<PositionSlot[]>(() => positions.map(p => ({ posId: p.id, playerId: null })))
  const [bench, setBench] = useState<BenchEntry[]>(() => squad.map(p => ({ playerId: p.id, sinceGameSec: 0 })))
  const [subs, setSubs] = useState<SubRecord[]>([])
  const [notes, setNotes] = useState('')
  const [result, setResult] = useState('')
  const [gameSec, setGameSec] = useState(0)
  const [running, setRunning] = useState(false)
  const [selected, setSelected] = useState<{ type: 'field'; posId: string } | { type: 'bench'; playerId: string } | null>(null)
  const [activeTab, setActiveTab] = useState<'bench' | 'subs' | 'notes'>('bench')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (running) intervalRef.current = setInterval(() => setGameSec(s => s + 1), 1000)
    else if (intervalRef.current) clearInterval(intervalRef.current)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [running])

  const getPlayer = (id: string | null) => id ? squad.find(p => p.id === id) ?? null : null

  const doSub = (inId: string, posId: string) => {
    const outId = slots.find(s => s.posId === posId)?.playerId ?? null
    setSlots(sl => sl.map(s => s.posId === posId ? { ...s, playerId: inId } : s))
    setBench(b => b.filter(e => e.playerId !== inId).concat(outId ? [{ playerId: outId, sinceGameSec: gameSec }] : []))
    if (outId) setSubs(s => [...s, { gameTimeSec: gameSec, playerInId: inId, playerOutId: outId }])
    setSelected(null)
  }

  const swapField = (posA: string, posB: string) => {
    const aId = slots.find(s => s.posId === posA)?.playerId ?? null
    const bId = slots.find(s => s.posId === posB)?.playerId ?? null
    setSlots(sl => sl.map(s => {
      if (s.posId === posA) return { ...s, playerId: bId }
      if (s.posId === posB) return { ...s, playerId: aId }
      return s
    }))
    setSelected(null)
  }

  const sendToBench = (posId: string) => {
    const pid = slots.find(s => s.posId === posId)?.playerId
    if (!pid) return
    setSlots(sl => sl.map(s => s.posId === posId ? { ...s, playerId: null } : s))
    setBench(b => [...b.filter(e => e.playerId !== pid), { playerId: pid, sinceGameSec: gameSec }])
    setSelected(null)
  }

  const handleFieldClick = (posId: string) => {
    const slot = slots.find(s => s.posId === posId)!
    if (selected?.type === 'bench') {
      doSub(selected.playerId, posId)
    } else if (selected?.type === 'field') {
      if (selected.posId === posId) { setSelected(null); return }
      const aId = slots.find(s => s.posId === selected.posId)?.playerId ?? null
      const bId = slot.playerId
      setSlots(sl => sl.map(s => {
        if (s.posId === selected.posId) return { ...s, playerId: bId }
        if (s.posId === posId) return { ...s, playerId: aId }
        return s
      }))
      setSelected(null)
    } else {
      setSelected({ type: 'field', posId })
      setActiveTab('bench')
    }
  }

  const handleBenchClick = (playerId: string) => {
    if (selected?.type === 'field') {
      doSub(playerId, selected.posId)
    } else if (selected?.type === 'bench' && selected.playerId === playerId) {
      setSelected(null)
    } else {
      setSelected({ type: 'bench', playerId })
    }
  }

  // Drag-and-drop handlers
  const handlePositionDrop = (posId: string, dragType: string, dragId: string) => {
    if (dragType === 'bench') {
      doSub(dragId, posId)
    } else if (dragType === 'field') {
      swapField(dragId, posId)
    }
  }

  const handleBenchDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('type')
    const id = e.dataTransfer.getData('id')
    if (type === 'field') sendToBench(id)
  }

  const benchPlayers = bench
    .map(b => ({ ...b, player: getPlayer(b.playerId) }))
    .filter(b => b.player) as (BenchEntry & { player: Player })[]

  const onFieldCount = slots.filter(s => s.playerId).length
  const targetCount = AGE_CONFIG[ageGroup].total
  const selectedFieldPos = selected?.type === 'field' ? selected.posId : null
  const selectedFieldPlayer = selectedFieldPos ? getPlayer(slots.find(s => s.posId === selectedFieldPos)?.playerId ?? null) : null

  const saveGame = () => {
    onSave({ id: uid(), date: todayStr(), club, team, ageGroup, opponent, homeAway, squad, slots, subs, notes, result, finalTime: gameSec })
    alert('Wedstrijd opgeslagen!')
  }

  return (
    <div className="flex flex-col" style={{ height: '100dvh', background: '#EEF3FF' }}
      onClick={() => setSelected(null)}>

      {/* Header */}
      <div className="shrink-0 text-white px-3 py-2" style={{ background: '#0D2B7A' }}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <button onClick={onBack} className="text-xs shrink-0 font-semibold" style={{ color: '#7B9DE0' }}>← Terug</button>
            <SCMuidenLogo size={30} />
            <div className="min-w-0">
              <div className="font-display font-bold text-sm leading-none truncate">{club} {team}</div>
              <div className="text-xs leading-none mt-0.5 truncate" style={{ color: '#7B9DE0' }}>
                {homeAway === 'Thuis' ? 'vs' : '@'} {opponent} · {ageGroup}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="font-mono font-bold text-xl tabular-nums">{fmtSec(gameSec)}</div>
            <button onClick={e => { e.stopPropagation(); setRunning(r => !r) }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold"
              style={{ background: running ? '#D97706' : '#16A34A', color: '#fff' }}>
              {running ? '⏸' : '▶'}
            </button>
            <button onClick={e => { e.stopPropagation(); saveGame() }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-white"
              style={{ background: '#1A3FAB' }}>
              Opslaan
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Field column */}
        <div className="flex flex-col flex-1 overflow-hidden p-3 items-center"
          onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between w-full mb-2"
            style={{ maxWidth: isDual ? '540px' : '290px' }}>
            <span className="text-xs font-bold" style={{ color: '#6B82B8' }}>
              Op veld:&nbsp;
              <span style={{ color: onFieldCount < targetCount ? '#DC2626' : '#16A34A' }}>
                {onFieldCount}/{targetCount}
              </span>
            </span>
            {selected ? (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: '#DBEAFE', color: '#1A3FAB' }}>
                {selected.type === 'bench'
                  ? `Kies positie voor ${getPlayer(selected.playerId)?.name.split(' ')[0]}`
                  : selectedFieldPlayer ? `${selectedFieldPlayer.name.split(' ')[0]} geselecteerd` : 'Positie geselecteerd'}
              </span>
            ) : (
              <span className="text-xs" style={{ color: '#A8BEF0' }}>Sleep of klik om te wisselen</span>
            )}
          </div>

          <div className="flex-1 flex items-center justify-center w-full"
            style={{ maxWidth: isDual ? '540px' : '290px' }}>
            <FieldView
              ageGroup={ageGroup}
              slots={slots}
              squad={squad}
              selected={selected}
              onFieldClick={handleFieldClick}
              onPositionDrop={handlePositionDrop}
            />
          </div>

          {selectedFieldPos && (
            <div className="flex gap-2 mt-2" onClick={e => e.stopPropagation()}>
              {slots.find(s => s.posId === selectedFieldPos)?.playerId && (
                <button onClick={() => sendToBench(selectedFieldPos)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white"
                  style={{ background: '#4B5563' }}>
                  → Bank
                </button>
              )}
              <button onClick={() => setSelected(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: '#D0DCFA', color: '#1A3FAB' }}>
                Annuleer
              </button>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="w-64 flex flex-col bg-white shrink-0 overflow-hidden"
          style={{ borderLeft: '1px solid #D0DCFA' }}
          onClick={e => e.stopPropagation()}>
          {/* Tabs */}
          <div className="flex shrink-0" style={{ borderBottom: '1px solid #E8EFFD' }}>
            {(['bench', 'subs', 'notes'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className="flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors"
                style={{
                  color: activeTab === tab ? '#1A3FAB' : '#A8BEF0',
                  borderBottom: activeTab === tab ? '2.5px solid #1A3FAB' : '2.5px solid transparent',
                }}>
                {tab === 'bench' ? `Bank (${benchPlayers.length})` : tab === 'subs' ? `Wissels (${subs.length})` : 'Notities'}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto"
            onDragOver={activeTab === 'bench' ? e => e.preventDefault() : undefined}
            onDrop={activeTab === 'bench' ? handleBenchDrop : undefined}>
            {activeTab === 'bench' && (
              <div className="p-2 space-y-1.5">
                {benchPlayers.length === 0 ? (
                  <div className="text-xs text-center py-8 rounded-xl border-2 border-dashed m-2"
                    style={{ color: '#A8BEF0', borderColor: '#D0DCFA' }}>
                    Alle spelers staan op het veld
                  </div>
                ) : (
                  benchPlayers.sort((a, b) => a.player.number - b.player.number).map(({ playerId, sinceGameSec, player }) => {
                    const elapsed = Math.max(0, gameSec - sinceGameSec)
                    const isSel = selected?.type === 'bench' && selected.playerId === playerId
                    return (
                      <div key={playerId}
                        className="flex items-center gap-2.5 p-2.5 rounded-xl cursor-grab transition-all"
                        style={{
                          background: isSel ? '#EEF3FF' : '#F8FAFF',
                          border: isSel ? '1.5px solid #1A3FAB' : '1.5px solid #E8EFFD',
                        }}
                        draggable
                        onDragStart={e => {
                          e.dataTransfer.setData('type', 'bench')
                          e.dataTransfer.setData('id', playerId)
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        onClick={() => handleBenchClick(playerId)}>
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                          style={{ background: '#1A3FAB' }}>
                          {player.number}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate" style={{ color: '#1A2F6B' }}>{player.name}</div>
                          <div className="font-mono text-xs font-bold mt-0.5"
                            style={{ color: gameSec > 0 ? benchColor(elapsed) : '#A8BEF0' }}>
                            {gameSec > 0 ? fmtSec(elapsed) : '—:—'}
                          </div>
                        </div>
                        {isSel && <span className="text-xs font-bold" style={{ color: '#1A3FAB' }}>↔</span>}
                      </div>
                    )
                  })
                )}
              </div>
            )}

            {activeTab === 'subs' && (
              <div className="p-3 space-y-2">
                {subs.length === 0 && (
                  <p className="text-xs text-center py-8" style={{ color: '#A8BEF0' }}>Nog geen wissels</p>
                )}
                {subs.map((s, i) => {
                  const pIn = getPlayer(s.playerInId)
                  const pOut = getPlayer(s.playerOutId)
                  return (
                    <div key={i} className="py-2.5 rounded-xl px-3"
                      style={{ background: '#F0F5FF', border: '1px solid #E4ECFE' }}>
                      <div className="font-mono text-xs font-bold mb-1" style={{ color: '#7B90C8' }}>{fmtSec(s.gameTimeSec)}</div>
                      <div className="text-xs font-semibold" style={{ color: '#16A34A' }}>↑ #{pIn?.number} {pIn?.name}</div>
                      <div className="text-xs font-semibold" style={{ color: '#DC2626' }}>↓ #{pOut?.number} {pOut?.name}</div>
                    </div>
                  )
                })}
              </div>
            )}

            {activeTab === 'notes' && (
              <div className="p-3 space-y-3">
                <div>
                  <label className="block text-xs font-bold uppercase mb-1" style={{ color: '#7B90C8', letterSpacing: '0.1em' }}>Uitslag</label>
                  <input className="w-full rounded-xl px-3 py-2 text-sm font-bold"
                    style={{ border: '1.5px solid #D0DCFA', background: '#F8FAFF', color: '#1A2F6B', outline: 'none' }}
                    value={result} onChange={e => setResult(e.target.value)}
                    placeholder="bijv. 3-1" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase mb-1" style={{ color: '#7B90C8', letterSpacing: '0.1em' }}>Notities</label>
                  <textarea className="w-full rounded-xl px-3 py-2 text-sm resize-none"
                    style={{ border: '1.5px solid #D0DCFA', background: '#F8FAFF', color: '#1A2F6B', outline: 'none' }}
                    rows={8} value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder="Tactische notities, bijzonderheden…" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── History View ─────────────────────────────────────────────────────────────

function HistoryView({ games, onBack, onDelete }: {
  games: SavedGame[]
  onBack: () => void
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const getPlayer = (g: SavedGame, id: string) => g.squad.find(p => p.id === id)

  return (
    <div className="min-h-screen" style={{ background: '#EEF3FF' }}>
      <header style={{ background: '#0D2B7A' }} className="text-white sticky top-0 z-20 shadow-lg">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-4">
          <button onClick={onBack} className="text-sm font-semibold" style={{ color: '#7B9DE0' }}>← Terug</button>
          <SCMuidenLogo size={32} />
          <h1 className="font-display text-2xl font-bold uppercase tracking-widest">Wedstrijd Geschiedenis</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {games.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🏑</div>
            <p className="font-display text-xl font-bold uppercase" style={{ color: '#A8BEF0' }}>Nog geen wedstrijden</p>
          </div>
        ) : (
          <div className="space-y-3">
            {[...games].reverse().map(g => (
              <div key={g.id} className="bg-white rounded-2xl overflow-hidden shadow-sm"
                style={{ border: '1px solid #D0DCFA' }}>
                <button className="w-full text-left px-5 py-4 flex items-center justify-between"
                  onClick={() => setExpanded(expanded === g.id ? null : g.id)}>
                  <div className="min-w-0">
                    <div className="font-display text-lg font-bold leading-tight" style={{ color: '#0D2B7A' }}>
                      {g.club} {g.team}&nbsp;
                      <span style={{ color: '#7B90C8', fontWeight: 400 }}>{g.homeAway === 'Thuis' ? 'vs' : '@'}</span>
                      &nbsp;{g.opponent}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-0.5">
                      <span className="text-xs font-medium" style={{ color: '#7B90C8' }}>{g.date}</span>
                      <span className="text-xs font-bold" style={{ color: '#1A3FAB' }}>{g.ageGroup}</span>
                      {g.result && <span className="text-xs font-bold" style={{ color: '#1A3FAB' }}>{g.result}</span>}
                      <span className="text-xs font-mono" style={{ color: '#A8BEF0' }}>{fmtSec(g.finalTime)}</span>
                    </div>
                  </div>
                  <span className="text-xs ml-4 shrink-0" style={{ color: '#C8D5F5' }}>
                    {expanded === g.id ? '▲' : '▼'}
                  </span>
                </button>

                {expanded === g.id && (
                  <div className="px-5 pb-5" style={{ borderTop: '1px solid #EEF3FF' }}>
                    <div className="pt-4 space-y-4">
                      <div>
                        <h4 className="font-display text-sm font-bold uppercase mb-2" style={{ color: '#7B90C8' }}>
                          Selectie ({g.squad.length})
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {[...g.squad].sort((a, b) => a.number - b.number).map(p => (
                            <span key={p.id} className="text-xs px-2 py-1 rounded-lg font-medium"
                              style={{ background: '#EEF3FF', color: '#1A2F6B', border: '1px solid #D0DCFA' }}>
                              <span className="font-mono font-bold" style={{ color: '#1A3FAB' }}>#{p.number}</span> {p.name}
                            </span>
                          ))}
                        </div>
                      </div>

                      {g.subs.length > 0 && (
                        <div>
                          <h4 className="font-display text-sm font-bold uppercase mb-2" style={{ color: '#7B90C8' }}>Wissels</h4>
                          <div className="space-y-1">
                            {g.subs.map((s, i) => {
                              const pIn = getPlayer(g, s.playerInId)
                              const pOut = getPlayer(g, s.playerOutId)
                              return (
                                <div key={i} className="flex items-center gap-2 text-xs">
                                  <span className="font-mono font-bold w-10 shrink-0" style={{ color: '#7B90C8' }}>{fmtSec(s.gameTimeSec)}</span>
                                  <span className="font-semibold" style={{ color: '#16A34A' }}>↑ {pIn?.name}</span>
                                  <span className="font-semibold" style={{ color: '#DC2626' }}>↓ {pOut?.name}</span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {g.notes && (
                        <div>
                          <h4 className="font-display text-sm font-bold uppercase mb-1" style={{ color: '#7B90C8' }}>Notities</h4>
                          <p className="text-sm whitespace-pre-wrap" style={{ color: '#3B4F7A' }}>{g.notes}</p>
                        </div>
                      )}

                      <button onClick={() => { if (confirm('Wedstrijd verwijderen?')) onDelete(g.id) }}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg"
                        style={{ color: '#DC2626', border: '1px solid #FCA5A5' }}>
                        Verwijder
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<View>('setup')
  const [gameParams, setGameParams] = useState<GameParams | null>(null)
  const [games, setGames] = useLS<SavedGame[]>('fh_games', [])

  if (view === 'history')
    return <HistoryView games={games} onBack={() => setView('setup')} onDelete={id => setGames(g => g.filter(x => x.id !== id))} />
  if (view === 'game' && gameParams)
    return <GameView {...gameParams} onSave={g => setGames(gs => [...gs, g])} onBack={() => setView('setup')} />
  return <SetupView onStart={p => { setGameParams(p); setView('game') }} onHistory={() => setView('history')} gameCount={games.length} />
}
