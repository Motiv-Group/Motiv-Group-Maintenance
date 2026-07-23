import 'server-only'
/* eslint-disable jsx-a11y/alt-text -- <Image> here is @react-pdf/renderer's PDF
   primitive, not an HTML <img>; it takes no `alt` prop. */
// On-brand project report, rendered to PDF with @react-pdf/renderer (pure JS — no
// headless Chrome, so it runs in a normal Node serverless function). The route
// assembles a RenderReport (photos already fetched + downsampled to data URIs) and
// calls renderProjectReport(). Dates arrive pre-formatted so this file is pure view.
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer'

export interface RenderPhoto { dataUri: string; caption: string | null }
export interface RenderMilestone { label: string; done: boolean; date: string | null }
export interface RenderStore {
  branchCode: string
  name: string
  town: string | null
  progress: number
  statusLabel: string
  overdue: boolean
  startDate: string | null
  endDate: string | null
  milestones: RenderMilestone[]
  before: RenderPhoto[]
  after: RenderPhoto[]
}
export interface RenderReport {
  appName: string
  brandHex: string
  logoDataUri: string | null
  generatedAt: string
  project: {
    name: string
    client: string | null
    region: string | null
    statusLabel: string
    startDate: string | null
    endDate: string | null
    progress: number
  }
  summary: { stores: number; completed: number; inProgress: number; notStarted: number; overdue: number }
  stores: RenderStore[]
}

const INK = '#1a1c22'
const MUTED = '#5b616e'
const FAINT = '#9aa0ac'
const LINE = '#e5e7eb'
const SURFACE = '#f7f8fa'
const EMERALD = '#059669'
const AMBER = '#b45309'
const SLATE = '#64748b'

const s = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 54, paddingHorizontal: 40, fontSize: 9, color: INK, fontFamily: 'Helvetica' },
  // Cover
  coverBar: { height: 6, marginHorizontal: -40, marginTop: -44, marginBottom: 26 },
  coverHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 30 },
  logo: { width: 30, height: 30, marginRight: 10, objectFit: 'contain' },
  appName: { fontSize: 12, fontFamily: 'Helvetica-Bold', letterSpacing: 1 },
  kicker: { fontSize: 10, color: MUTED, letterSpacing: 2, marginBottom: 6, fontFamily: 'Helvetica-Bold' },
  title: { fontSize: 26, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  subtitle: { fontSize: 11, color: MUTED, marginBottom: 22 },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 22 },
  metaCell: { width: '50%', marginBottom: 10 },
  metaLabel: { fontSize: 7.5, color: FAINT, letterSpacing: 1, marginBottom: 2, fontFamily: 'Helvetica-Bold' },
  metaValue: { fontSize: 11, color: INK },
  // Progress
  progressWrap: { marginBottom: 24 },
  progressTrack: { height: 9, backgroundColor: SURFACE, borderRadius: 5, overflow: 'hidden' },
  progressFill: { height: 9, borderRadius: 5 },
  // KPIs
  kpiRow: { flexDirection: 'row', marginHorizontal: -4 },
  kpiCard: { flex: 1, marginHorizontal: 4, padding: 10, borderRadius: 6, backgroundColor: SURFACE, borderWidth: 1, borderColor: LINE },
  kpiValue: { fontSize: 18, fontFamily: 'Helvetica-Bold' },
  kpiLabel: { fontSize: 7.5, color: MUTED, marginTop: 3 },
  // Section
  sectionTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginTop: 24, marginBottom: 12, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: LINE },
  // Store card
  store: { borderWidth: 1, borderColor: LINE, borderRadius: 7, padding: 12, marginBottom: 12 },
  storeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  storeTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  storeSub: { fontSize: 8, color: MUTED, marginTop: 1 },
  pill: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 8, color: '#fff' },
  msRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  msItem: { width: '25%', paddingRight: 6 },
  msLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  msDate: { fontSize: 7.5, color: MUTED },
  photoGroupLabel: { fontSize: 7.5, color: FAINT, letterSpacing: 1, marginTop: 6, marginBottom: 4, fontFamily: 'Helvetica-Bold' },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap' },
  photo: { width: 92, height: 69, marginRight: 6, marginBottom: 6, borderRadius: 4, objectFit: 'cover', borderWidth: 1, borderColor: LINE },
  noPhotos: { fontSize: 8, color: FAINT, marginBottom: 4 },
  // Footer
  footer: { position: 'absolute', bottom: 24, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: FAINT, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 6 },
})

function statusColor(label: string): string {
  const l = label.toLowerCase()
  if (l.includes('complete') || l.includes('done') || l.includes('signed')) return EMERALD
  if (l.includes('overdue') || l.includes('risk')) return AMBER
  if (l.includes('progress')) return '#2563eb'
  return SLATE
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.metaCell}>
      <Text style={s.metaLabel}>{label.toUpperCase()}</Text>
      <Text style={s.metaValue}>{value}</Text>
    </View>
  )
}

function Kpi({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <View style={s.kpiCard}>
      <Text style={[s.kpiValue, color ? { color } : {}]}>{value}</Text>
      <Text style={s.kpiLabel}>{label}</Text>
    </View>
  )
}

function PhotoRow({ label, photos }: { label: string; photos: RenderPhoto[] }) {
  return (
    <View>
      <Text style={s.photoGroupLabel}>{label}</Text>
      {photos.length ? (
        <View style={s.photoRow}>
          {photos.map((p, i) => <Image key={i} src={p.dataUri} style={s.photo} />)}
        </View>
      ) : <Text style={s.noPhotos}>None uploaded.</Text>}
    </View>
  )
}

function StoreCard({ store, brandHex }: { store: RenderStore; brandHex: string }) {
  return (
    <View style={s.store} wrap={false}>
      <View style={s.storeHead}>
        <View>
          <Text style={s.storeTitle}>{store.branchCode}{store.name ? ` · ${store.name}` : ''}</Text>
          <Text style={s.storeSub}>
            {[store.town, store.startDate && `Start ${store.startDate}`, store.endDate && `End ${store.endDate}`].filter(Boolean).join('  ·  ') || '—'}
          </Text>
        </View>
        <Text style={[s.pill, { backgroundColor: store.overdue ? AMBER : statusColor(store.statusLabel) }]}>
          {store.progress}%  {store.overdue ? 'OVERDUE' : store.statusLabel}
        </Text>
      </View>

      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${Math.max(2, store.progress)}%`, backgroundColor: brandHex }]} />
      </View>

      <View style={[s.msRow, { marginTop: 8 }]}>
        {store.milestones.map((m, i) => (
          <View key={i} style={s.msItem}>
            <Text style={[s.msLabel, { color: m.done ? EMERALD : FAINT }]}>{m.done ? '✓ ' : '○ '}{m.label}</Text>
            <Text style={s.msDate}>{m.date ?? '—'}</Text>
          </View>
        ))}
      </View>

      <PhotoRow label="BEFORE" photos={store.before} />
      <PhotoRow label="AFTER" photos={store.after} />
    </View>
  )
}

function ProjectReportDoc({ r }: { r: RenderReport }) {
  const dateRange = [r.project.startDate, r.project.endDate].filter(Boolean).join('  →  ') || 'Not scheduled'
  return (
    <Document title={`${r.project.name} — Project report`} author={r.appName}>
      {/* Cover + summary */}
      <Page size="LETTER" style={s.page}>
        <View style={[s.coverBar, { backgroundColor: r.brandHex }]} fixed={false} />
        <View style={s.coverHead}>
          {r.logoDataUri ? <Image src={r.logoDataUri} style={s.logo} /> : null}
          <Text style={s.appName}>{r.appName.toUpperCase()}</Text>
        </View>

        <Text style={s.kicker}>PROJECT REPORT</Text>
        <Text style={s.title}>{r.project.name}</Text>
        <Text style={s.subtitle}>{[r.project.client, r.project.region].filter(Boolean).join('  ·  ') || 'Rollout progress'}</Text>

        <View style={s.metaGrid}>
          <Meta label="Client" value={r.project.client || '—'} />
          <Meta label="Region" value={r.project.region || '—'} />
          <Meta label="Status" value={r.project.statusLabel} />
          <Meta label="Timeline" value={dateRange} />
        </View>

        <View style={s.progressWrap}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
            <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Bold' }}>OVERALL PROGRESS</Text>
            <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold' }}>{r.project.progress}%</Text>
          </View>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${Math.max(2, r.project.progress)}%`, backgroundColor: r.brandHex }]} />
          </View>
        </View>

        <View style={s.kpiRow}>
          <Kpi value={r.summary.stores} label="Stores" />
          <Kpi value={r.summary.completed} label="Completed" color={EMERALD} />
          <Kpi value={r.summary.inProgress} label="In progress" color="#2563eb" />
          <Kpi value={r.summary.notStarted} label="Not started" color={SLATE} />
          <Kpi value={r.summary.overdue} label="Overdue" color={AMBER} />
        </View>

        <Text style={s.sectionTitle}>Store progress ({r.stores.length})</Text>
        {r.stores.map((store, i) => <StoreCard key={i} store={store} brandHex={r.brandHex} />)}
        {!r.stores.length ? <Text style={s.noPhotos}>No stores on this project yet.</Text> : null}

        <View style={s.footer} fixed>
          <Text>{r.appName} · {r.project.name}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
          <Text>Generated {r.generatedAt} · Confidential</Text>
        </View>
      </Page>
    </Document>
  )
}

export function renderProjectReport(r: RenderReport): Promise<Buffer> {
  return renderToBuffer(<ProjectReportDoc r={r} />)
}
