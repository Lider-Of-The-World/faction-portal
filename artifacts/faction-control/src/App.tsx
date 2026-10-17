import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import {
  Activity, ArrowUpRight, BookOpen, CalendarDays, Check, CheckCheck,
  ClipboardList, Clock3, FileImage, Flag, LayoutDashboard, LogOut, Menu, Plus,
  Search, Settings, Shield, ShieldAlert, Users, X, KeyRound, Eye, EyeOff,
  Pencil, Trash2, MapPin, ListChecks, CircleAlert, LoaderCircle, Bell, Camera,
  Upload, History, Send, Ban, ImagePlus, FileCheck2,
} from 'lucide-react';
import {
  useChangePassword, useCreateEvent, useCreateMember,
  useCreateStandard, useCreateStandardAssignment, useCreateTask,
  useDeleteEvent, useDeleteMember, useDeleteStandard, useGetCurrentUser, getGetSetupStatusQueryKey,
  useGetDashboard, useGetSetupStatus, useHealthCheck,
  useListEvents, useListMembers, useListStandards, useListStandardAssignments,
  useListStandardSubmissions, useListTasks, useListTaskSubmissions, useListNotifications,
  useLogin, useLogout, useMarkAllNotificationsRead, useMarkNotificationRead,
  useRequestUploadUrl, useReviewStandardSubmission, useReviewTaskSubmission,
  useSubmitStandard, useSubmitTask, useCancelTask, useUpdateEvent, useUpdateMember,
  useUpdateStandard, useUpdateTask, getGetCurrentUserQueryKey, getGetDashboardQueryKey,
  getHealthCheckQueryKey, getListMembersQueryKey, getListEventsQueryKey,
  getListStandardsQueryKey, getListStandardAssignmentsQueryKey,
  getListStandardSubmissionsQueryKey, getListTasksQueryKey, getListTaskSubmissionsQueryKey,
  getListNotificationsQueryKey,
} from '@workspace/api-client-react';
import {
  getDisciplineRecordsQueryKey,
  useAuditLogRecords, useDisciplineRecords, useIssueDiscipline, useRevokeDiscipline,
  type AuditCategory, type AuditLogEntry, type DisciplineRecord, type DisciplineType,
} from './discipline-client';
import type {
  Event, Member, Standard, StandardAssignment, Task, SessionUser, Notification,
  StandardSubmission, TaskSubmission, SubmissionFile,
} from '@workspace/api-client-react';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, refetchOnMount: 'always' } },
});
const NAV_ITEMS = [
  { href: '/dashboard', label: 'Обзор', icon: LayoutDashboard },
  { href: '/members', label: 'Состав', icon: Users, staff: true },
  { href: '/events', label: 'Мероприятия', icon: CalendarDays, staff: true },
  { href: '/standards', label: 'Нормативы', icon: BookOpen },
  { href: '/tasks', label: 'Поручения', icon: ClipboardList },
  { href: '/notifications', label: 'Уведомления', icon: Bell },
  { href: '/discipline', label: 'Дисциплина', icon: ShieldAlert, staff: true },
  { href: '/audit', label: 'Журнал действий', icon: History, staff: true },
  { href: '/settings', label: 'Настройки', icon: Settings },
];
const ROLE_LABEL: Record<string, string> = { leader: 'Лидер', admin: 'Администратор', employee: 'Сотрудник' };
const LABEL: Record<string, string> = {
  active: 'Активен', blocked: 'Заблокирован', removed: 'Исключён', planned: 'Запланировано', completed: 'Завершено',
  cancelled: 'Отменено', assigned: 'Назначено', in_progress: 'В работе', pending_review: 'На проверке',
  approved: 'Принято', rejected: 'Отклонено', revision_required: 'Нужна доработка',
  not_submitted: 'Не сдано', overdue: 'Срок истёк', low: 'Низкий', normal: 'Обычный',
  high: 'Высокий', urgent: 'Срочный', standard_assigned: 'Назначен норматив',
  revoked: 'Снято', converted: 'Конвертировано',
  standard_submitted: 'Норматив отправлен', standard_reviewed: 'Результат норматива',
  task_assigned: 'Новое поручение', task_submitted: 'Поручение отправлено',
  task_reviewed: 'Результат поручения', task_cancelled: 'Поручение отменено',
};
const dateText = (value?: string | null, time = false) => value
  ? new Intl.DateTimeFormat('ru-RU', time ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value))
  : 'Без срока';
const initials = (name = '') => name.split(/[\s_-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
const invalidate = (qc: ReturnType<typeof useQueryClient>, ...keys: (readonly unknown[])[]) => keys.forEach((queryKey) => void qc.invalidateQueries({ queryKey }));
const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];
const maxImageSize = 10 * 1024 * 1024;

function App() {
  return <QueryClientProvider client={queryClient}><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter></QueryClientProvider>;
}

function Router() {
  const { data: user, isLoading, isError, refetch } = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), retry: false, refetchOnMount: 'always' } });
  const [path, setPath] = useLocation();
  useEffect(() => { if (user?.mustChangePassword && path !== '/settings') setPath('/settings'); }, [user?.mustChangePassword, path, setPath]);
  useEffect(() => { if (!isLoading && (isError || !user) && path !== '/login') setPath('/login'); if (user && !user.mustChangePassword && path === '/login') setPath('/dashboard'); }, [isLoading, isError, user, path, setPath]);
  if (isLoading) return <FullLoading />;
  if (isError || !user) return <LoginScreen onAuthenticated={() => { void refetch(); setPath('/dashboard'); }} />;
  return <Shell user={user}><Switch>
    <Route path="/login"><HomeRedirect /></Route>
    <Route path="/"><HomeRedirect /></Route>
    <Route path="/dashboard"><DashboardPage user={user} /></Route>
    <Route path="/members">{user.role !== 'employee' ? <MembersPage user={user} /> : <AccessDenied />}</Route>
    <Route path="/events">{user.role !== 'employee' ? <EventsPage /> : <AccessDenied />}</Route>
    <Route path="/standards"><StandardsPage user={user} /></Route>
    <Route path="/tasks"><TasksPage user={user} /></Route>
    <Route path="/notifications"><NotificationsPage /></Route>
    <Route path="/discipline">{user.role !== 'employee' ? <DisciplinePage /> : <AccessDenied />}</Route>
    <Route path="/audit">{user.role !== 'employee' ? <AuditPage /> : <AccessDenied />}</Route>
    <Route path="/settings"><SettingsPage user={user} /></Route>
    <Route><NotFound /></Route>
  </Switch></Shell>;
}

function HomeRedirect() { const [, navigate] = useLocation(); useEffect(() => { navigate('/dashboard'); }, [navigate]); return <FullLoading />; }
function FullLoading() { return <div className="loading-screen"><div className="loading-mark"><Shield size={21} /></div><div className="skeleton-line" /><span>Подключение к системе</span></div>; }

function LoginScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const setup = useGetSetupStatus({ query: { queryKey: getGetSetupStatusQueryKey(), refetchOnMount: 'always' } });
  const login = useLogin(); const [nickname, setNickname] = useState(''); const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false); const [error, setError] = useState('');
  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); login.mutate({ data: { nickname: nickname.trim(), password } }, { onSuccess: onAuthenticated, onError: (err) => setError((err as Error)?.message || 'Проверьте имя и пароль.') }); };
  return <main className="auth-page"><div className="auth-grid" aria-hidden="true" /><section className="auth-card">
    <BrandLockup /><div className="auth-rule"><span>СЛУЖЕБНЫЙ ДОСТУП · ВХОД ПО УЧЁТНОЙ ЗАПИСИ</span><i /></div>
    <h1>Вход в систему</h1><p className="auth-lead">Используйте игровое имя и пароль своей учётной записи.</p>
    {setup.isError && <InlineError message="Не удалось проверить состояние сервера." onRetry={() => void setup.refetch()} />}
      {setup.data && !setup.data.setupComplete && <div className="bootstrap-note"><CircleAlert size={18} /><div><strong>Первый запуск</strong><p>Учётная запись лидера создаётся автоматически. Войдите как <code>Winston_Goodman</code> с паролем <code>1234</code>; после входа система сразу потребует установить новый пароль длиной не менее 10 символов.</p></div></div>}
    <form className="auth-form" onSubmit={submit}><Field label="ИГРОВОЕ ИМЯ"><input data-testid="input-login-nickname" autoComplete="username" value={nickname} onChange={(e) => setNickname(e.target.value)} minLength={3} maxLength={32} placeholder="Введите имя" required /></Field>
      <Field label="ПАРОЛЬ"><span className="password-field"><input data-testid="input-login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Введите пароль" required /><button type="button" className="icon-button" aria-label="Показать или скрыть пароль" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></Field>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="button button-primary auth-submit" disabled={login.isPending}>{login.isPending ? <><LoaderCircle className="spin" size={16} /> Проверка доступа</> : <>Войти <ArrowUpRight size={16} /></>}</button>
    </form><div className="auth-footer"><span>СЛУЖЕБНО</span><span>ПРАВИТЕЛЬСТВО ОБЛАСТИ</span><span>01 / 04</span></div>
  </section><div className="auth-side-note"><span className="status-pulse" /> СИСТЕМА ГОТОВА К РАБОТЕ</div></main>;
}

function BrandLockup() { return <div className="brand-lockup"><div className="brand-emblem"><Shield size={20} /></div><div><div className="brand-name">ПРАВИТЕЛЬСТВО<span>/</span>ОБЛАСТИ</div><div className="brand-sub">СЛУЖЕБНАЯ ПАНЕЛЬ</div></div></div>; }

function Shell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const [path] = useLocation(); const [mobileOpen, setMobileOpen] = useState(false); const qc = useQueryClient();
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 60000 } });
  const { data: notifications } = useListNotifications({ query: { queryKey: getListNotificationsQueryKey(), refetchInterval: 60000 } });
  const logout = useLogout(); const navItems = user.role === 'employee' ? NAV_ITEMS.filter((item) => !item.staff) : NAV_ITEMS;
  const doLogout = () => logout.mutate(undefined, { onSuccess: () => { qc.removeQueries({ queryKey: getGetCurrentUserQueryKey() }); window.location.assign(import.meta.env.BASE_URL || '/'); } });
  return <div className="app-shell"><aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
    <div className="sidebar-brand"><BrandLockup /><button className="icon-button mobile-close" aria-label="Закрыть меню" onClick={() => setMobileOpen(false)}><X size={18} /></button></div>
    <div className="sidebar-section-label">РАБОЧАЯ ЗОНА</div><nav className="side-nav" aria-label="Основная навигация">
      {navItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-link ${path === href ? 'active' : ''}`} onClick={() => setMobileOpen(false)} data-testid={`link-nav-${href.slice(1)}`}><Icon size={17} /><span>{label}</span>{href === '/notifications' && !!notifications?.filter((n) => !n.readAt).length && <b className="nav-count">{notifications.filter((n) => !n.readAt).length}</b>}{path === href && <i className="nav-active-mark" />}</Link>)}
    </nav><div className="sidebar-bottom"><div className="server-status"><span className={`status-pulse ${health.isError ? 'health-down' : ''}`} /><div><strong>{health.isLoading ? 'ПРОВЕРКА СВЯЗИ' : health.isError ? 'СЕРВЕР НЕДОСТУПЕН' : 'СЕРВЕР НА СВЯЗИ'}</strong><small>{health.isError ? 'Соединение нестабильно' : 'API отвечает штатно'}</small></div><Activity size={15} /></div>
      <div className="profile-strip"><div className="avatar">{initials(user.nickname)}</div><div className="profile-copy"><strong>{user.nickname}</strong><span>{ROLE_LABEL[user.role]} · {user.rank}</span></div><button className="icon-button logout-button" aria-label="Выйти из аккаунта" onClick={doLogout}><LogOut size={16} /></button></div>
    </div></aside>
    {mobileOpen && <button aria-label="Закрыть меню" className="mobile-scrim" onClick={() => setMobileOpen(false)} />}
     <div className="workspace"><header className="topbar"><button className="icon-button mobile-menu" aria-label="Открыть меню" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><div className="breadcrumb"><span>ПАНЕЛЬ</span><span className="crumb-slash">/</span><strong>{NAV_ITEMS.find((item) => item.href === path)?.label ?? 'Обзор'}</strong></div><div className="topbar-right"><div className="topbar-clock"><span className="status-pulse" /> СЕССИЯ АКТИВНА</div><div className="topbar-date">{dateText(new Date().toISOString())}</div><div className="avatar avatar-small">{initials(user.nickname)}</div></div></header>
      {user.mustChangePassword && <div className="password-alert"><KeyRound size={16} /><span>Для безопасности смените временный пароль.</span><Link href="/settings">Перейти к смене <ArrowUpRight size={14} /></Link></div>}
       <main className="main-content">{children}</main><footer className="app-footer"><span>ПРАВИТЕЛЬСТВО ОБЛАСТИ</span><span>СЛУЖЕБНОЕ ИСПОЛЬЗОВАНИЕ</span></footer>
    </div></div>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow"><span />{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action && <div className="heading-actions">{action}</div>}</div>;
}
function Panel({ title, meta, children, className = '' }: { title: string; meta?: string; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><div className="panel-heading"><h2>{title}</h2>{meta && <span>{meta}</span>}</div>{children}</section>;
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field-wrap"><span className="field-label">{label}</span>{children}</label>; }
function Modal({ title, subtitle, children, onClose, className = '' }: { title: string; subtitle: string; children: ReactNode; onClose: () => void; className?: string }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className={`modal-card ${className}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><span className="eyebrow"><span /> СЛУЖЕБНАЯ ФОРМА</span><h2 id="modal-title">{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={onClose} aria-label="Закрыть окно"><X size={18} /></button></div>{children}</section></div>;
}
function Badge({ status }: { status: string }) {
  const good = ['active', 'approved', 'completed']; const bad = ['blocked', 'removed', 'cancelled', 'rejected']; const warm = ['in_progress', 'pending_review', 'revision_required', 'overdue', 'assigned', 'not_submitted'];
  const style = good.includes(status) ? 'badge-good' : bad.includes(status) ? 'badge-bad' : warm.includes(status) ? 'badge-warm' : 'badge-neutral';
  return <span className={`status-badge ${style}`} data-testid={`status-${status}`}><i />{LABEL[status] ?? status}</span>;
}
function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) { return <div className="empty-state"><div className="empty-icon"><Flag size={19} /></div><h3>{title}</h3><p>{text}</p>{action && <div className="empty-action">{action}</div>}</div>; }
function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="inline-error" role="alert"><div className="error-symbol"><CircleAlert size={18} /></div><div><strong>Не удалось получить данные</strong><p>{message}</p></div><button className="button button-secondary button-small" onClick={onRetry}>Повторить</button></div>; }
function PageSkeleton() { return <div className="page-skeleton" aria-label="Загрузка"><div className="skeleton-block wide" /><div className="skeleton-row"><div className="skeleton-block" /><div className="skeleton-block" /><div className="skeleton-block" /></div><div className="skeleton-block tall" /></div>; }
function AccessDenied() { return <div className="access-denied"><div className="empty-icon"><Shield size={20} /></div><h2>Недостаточно прав</h2><p>Раздел доступен руководству Правительства области.</p><Link href="/dashboard" className="button button-secondary">Вернуться к обзору</Link></div>; }

function DashboardPage({ user }: { user: SessionUser }) {
  const { data, isLoading, isError, refetch } = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey(), refetchInterval: 60000 } });
  if (isLoading) return <PageSkeleton />;
  if (isError || !data) return <InlineError message="Сводка временно недоступна." onRetry={() => void refetch()} />;
  return <><PageHeading eyebrow={`СМЕНА / ${user.rank.toUpperCase()}`} title={`Добрый день, ${user.nickname}.`} description="Сводка по сотрудникам, поручениям и нормативам Правительства области." action={<div className="date-stamp"><span>ТЕКУЩАЯ ДАТА</span><strong>{dateText(new Date().toISOString())}</strong></div>} />
    <div className="overview-banner"><div className="banner-copy"><div className="banner-kicker"><span className="status-pulse" /> ОПЕРАЦИОННЫЙ ОБЗОР</div><h2>Сводка управления</h2><p>Сроки поручений и нормативов отображаются отдельно от дисциплинарных решений.</p></div><div className="banner-ornament"><div className="ornament-ring ring-a" /><div className="ornament-ring ring-b" /><Shield size={52} /></div><div className="banner-index"><span>01</span><i /></div></div>
    <div className="stats-grid"><StatCard label="СОСТАВ" value={data.memberCount} note={`${data.activeMembers} активны`} icon={Users} /><StatCard label="ОТКРЫТЫЕ ПОРУЧЕНИЯ" value={data.openTasks} note="В работе у команды" icon={ListChecks} accent /><StatCard label="НОРМАТИВЫ НА ПРОВЕРКЕ" value={data.pendingStandards} note={`${data.pendingTaskReviews} поручений ожидают оценки`} icon={BookOpen} /></div>
    <div className="dashboard-columns"><Panel title="Ближайшие события" meta={`${data.recentEvents.length} В ЛЕНТЕ`}>{data.recentEvents.length ? <div className="activity-list">{data.recentEvents.map((ev) => <div className="activity-row" key={ev.id}><div className="activity-date"><strong>{new Date(ev.startsAt).getDate()}</strong><span>{new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(new Date(ev.startsAt)).toUpperCase()}</span></div><div className="activity-info"><strong>{ev.title}</strong><span><MapPin size={12} />{ev.location || 'Место уточняется'}</span></div><Badge status={ev.status} /></div>)}</div> : <EmptyState title="Событий пока нет" text="Назначенные мероприятия появятся здесь." />}<Link href="/events" className="panel-link">Все мероприятия <ArrowUpRight size={15} /></Link></Panel>
      <Panel title="На контроле" meta={`${data.recentTasks.length} ПОРУЧЕНИЙ`}>{data.recentTasks.length ? <div className="task-feed">{data.recentTasks.map((task) => <div className="task-feed-row" key={task.id}><div className={`priority-line priority-${task.priority}`} /><div className="task-feed-copy"><strong>{task.title}</strong><span>{task.assigneeNickname} · {LABEL[task.status]}</span></div><span className="task-feed-date">{dateText(task.dueAt)}</span></div>)}</div> : <EmptyState title="Поручений пока нет" text="Новые задачи появятся в этой ленте." />}<Link href="/tasks" className="panel-link">Открыть поручения <ArrowUpRight size={15} /></Link></Panel></div>
    <div className="dashboard-footnote"><span className="mono">ДАННЫЕ СИСТЕМЫ</span><span><span className="status-pulse" /> СИНХРОНИЗИРОВАНО</span></div>
  </>;
}
function StatCard({ label, value, note, icon: Icon, accent = false }: { label: string; value: string | number; note: string; icon: typeof Users; accent?: boolean }) { return <div className={`stat-card ${accent ? 'stat-accent' : ''}`}><div className="stat-top"><span>{label}</span><Icon size={17} /></div><div className="stat-number">{value}</div><div className="stat-note"><span className="stat-marker" />{note}</div></div>; }

function StandardsPage({ user }: { user: SessionUser }) {
  const qc = useQueryClient(); const manager = user.role !== 'employee';
  const templates = useListStandards({ query: { queryKey: getListStandardsQueryKey(), enabled: manager, refetchOnMount: 'always' } });
  const assignments = useListStandardAssignments({ query: { queryKey: getListStandardAssignmentsQueryKey(), refetchOnMount: 'always' } });
  const members = useListMembers({ query: { queryKey: getListMembersQueryKey(), enabled: manager } });
  const createStandard = useCreateStandard(); const updateStandard = useUpdateStandard(); const deleteStandard = useDeleteStandard(); const createAssignment = useCreateStandardAssignment();
  const [editing, setEditing] = useState<Standard | null>(null); const [templateOpen, setTemplateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false); const [historyId, setHistoryId] = useState<string | null>(null);
  const [submitTarget, setSubmitTarget] = useState<StandardAssignment | null>(null);
  const saveTemplate = (payload: { title: string; description: string; requirements: string; category: string; target: number; unit: string }) => {
    const done = () => { invalidate(qc, getListStandardsQueryKey()); setTemplateOpen(false); setEditing(null); };
    if (editing) updateStandard.mutate({ id: editing.id, data: payload }, { onSuccess: done, onError: () => alert('Не удалось изменить норматив.') });
    else createStandard.mutate({ data: payload }, { onSuccess: done, onError: () => alert('Не удалось создать норматив.') });
  };
  const assign = (standardId: string, assigneeId: string, dueAt: string) => createAssignment.mutate({ data: { standardId, assigneeId, dueAt: new Date(dueAt).toISOString() } }, { onSuccess: () => { invalidate(qc, getListStandardAssignmentsQueryKey()); setAssignOpen(false); }, onError: () => alert('Не удалось назначить норматив.') });
  const anyLoading = assignments.isLoading || (manager && templates.isLoading);
  if (anyLoading) return <PageSkeleton />;
  if (assignments.isError || (manager && templates.isError)) return <InlineError message="Не удалось загрузить нормативы." onRetry={() => { void assignments.refetch(); void templates.refetch(); }} />;
  return <><PageHeading eyebrow="СТАНДАРТЫ / ИСПОЛНЕНИЕ" title="Нормативы" description={manager ? 'Каталог требований, назначения и проверка результата.' : 'Ваши назначенные нормативы и история подтверждений.'} action={manager ? <><button className="button button-secondary" onClick={() => { setEditing(null); setTemplateOpen(true); }}><Plus size={16} /> Новый шаблон</button><button className="button button-primary" onClick={() => setAssignOpen(true)}><Send size={15} /> Назначить</button></> : undefined} />
    {manager && <section className="template-zone"><div className="section-kicker"><span /> БИБЛИОТЕКА ТРЕБОВАНИЙ <span className="section-rule" /></div>{!templates.data?.length ? <div className="empty-slim">Шаблонов нет. Создайте норматив, чтобы назначить его сотрудникам.</div> : <div className="template-grid">{templates.data.map((s) => <article className="template-card" key={s.id}><div className="template-top"><span>{s.category}</span><div className="template-controls"><button className="icon-button" title={`Изменить ${s.title}`} aria-label={`Изменить ${s.title}`} onClick={() => { setEditing(s); setTemplateOpen(true); }}><Pencil size={14} /></button><button className="icon-button danger-icon" aria-label={`Удалить ${s.title}`} onClick={() => { if (confirm(`Удалить шаблон «${s.title}»?`)) deleteStandard.mutate({ id: s.id }, { onSuccess: () => invalidate(qc, getListStandardsQueryKey()), onError: () => alert('Не удалось удалить шаблон.') }); }}><Trash2 size={14} /></button></div></div><h3>{s.title}</h3><p>{s.description || s.requirements}</p><div className="template-target"><strong>{s.target}</strong><span>{s.unit}</span></div></article>)}</div>}</section>}
    <div className="section-kicker assignments-kicker"><span /> {manager ? 'НАЗНАЧЕННАЯ РАБОТА' : 'МОИ НОРМАТИВЫ'} <span className="section-rule" /><span className="section-count">{assignments.data?.length ?? 0}</span></div>
    {!assignments.data?.length ? <EmptyState title="Назначенных нормативов нет" text={manager ? 'Выберите шаблон и назначьте срок сотруднику.' : 'Назначенные нормативы появятся здесь.'} action={manager && <button className="button button-primary" onClick={() => setAssignOpen(true)}><Plus size={16} /> Назначить норматив</button>} /> : <div className="assignments-list">{assignments.data.map((a) => <AssignmentCard key={a.id} assignment={a} manager={manager} onSubmit={() => setSubmitTarget(a)} onHistory={() => setHistoryId(historyId === a.id ? null : a.id)} onReview={() => setHistoryId(a.id)} />)}</div>}
    {templateOpen && <Modal title={editing ? 'Изменить норматив' : 'Новый норматив'} subtitle="Шаблон фиксирует общие требования для назначения." onClose={() => { setTemplateOpen(false); setEditing(null); }}><StandardTemplateForm initial={editing} pending={createStandard.isPending || updateStandard.isPending} onCancel={() => { setTemplateOpen(false); setEditing(null); }} onSubmit={saveTemplate} /></Modal>}
    {assignOpen && <Modal title="Назначить норматив" subtitle="Параметры шаблона сохраняются в снимке назначения." onClose={() => setAssignOpen(false)}><AssignStandardForm standards={templates.data ?? []} members={members.data ?? []} pending={createAssignment.isPending} onCancel={() => setAssignOpen(false)} onSubmit={assign} /></Modal>}
    {submitTarget && <SubmitModal title="Отправить результат" detail={submitTarget.title} onClose={() => setSubmitTarget(null)} pendingHook="standard" id={submitTarget.id} onSubmitted={() => { invalidate(qc, getListStandardAssignmentsQueryKey()); setSubmitTarget(null); }} />}
    {historyId && <Modal title="Версии и проверка" subtitle="История подачи, комментарии и решения руководства." onClose={() => setHistoryId(null)} className="history-modal"><StandardAssignmentHistory id={historyId} manager={manager} onClose={() => setHistoryId(null)} onReviewed={() => invalidate(qc, getListStandardAssignmentsQueryKey())} /></Modal>}
  </>;
}

function AssignmentCard({ assignment: a, manager, onSubmit, onHistory, onReview }: { assignment: StandardAssignment; manager: boolean; onSubmit: () => void; onHistory: () => void; onReview: () => void }) {
   return <article className={`assignment-card status-edge-${a.status}`} data-testid={`card-standard-${a.id}`}><div className="assignment-stamp"><BookOpen size={17} /><span>{a.category}</span></div><div className="assignment-copy"><div className="assignment-title-line"><h2>{a.title}</h2><Badge status={a.status} /></div><p>{a.description || 'Описание не добавлено.'}</p>{a.requirements && <div className="standard-requirements"><span>ТРЕБОВАНИЯ</span><p>{a.requirements}</p></div>}<div className="assignment-facts"><span><Users size={13} />{manager ? a.assigneeNickname : `Назначил ${a.assignedByNickname}`}</span><span><Clock3 size={13} />Срок: {dateText(a.dueAt)}</span><span>{a.target} {a.unit}</span></div>{a.latestReviewReason && <div className="review-note"><strong>Комментарий руководства</strong><span>{a.latestReviewReason}</span></div>}{a.latestComment && <div className="last-comment">Комментарий отправки: {a.latestComment}</div>}</div><div className="assignment-actions"><button className="button button-secondary button-small" onClick={onHistory}><History size={14} /> История <span className="version-pill">{a.versionCount}</span></button>{manager ? <button className="button button-primary button-small" onClick={onReview} disabled={a.status !== 'pending_review'}><FileCheck2 size={14} /> Проверить</button> : ['not_submitted', 'rejected', 'revision_required', 'overdue'].includes(a.status) && <button className="button button-primary button-small" onClick={onSubmit}><Camera size={14} /> {a.versionCount ? 'Пересдать' : 'Отправить'}</button>}</div></article>;
}

function StandardTemplateForm({ initial, pending, onCancel, onSubmit }: { initial: Standard | null; pending: boolean; onCancel: () => void; onSubmit: (v: { title: string; description: string; requirements: string; category: string; target: number; unit: string }) => void }) {
  const [title, setTitle] = useState(initial?.title ?? ''); const [description, setDescription] = useState(initial?.description ?? ''); const [requirements, setRequirements] = useState(initial?.requirements ?? ''); const [category, setCategory] = useState(initial?.category ?? 'Служба'); const [target, setTarget] = useState(String(initial?.target ?? 1)); const [unit, setUnit] = useState(initial?.unit ?? '');
  return <form className="dialog-form" onSubmit={(e) => { e.preventDefault(); onSubmit({ title, description, requirements, category, target: Number(target), unit }); }}><Field label="Название"><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required /></Field><div className="form-split"><Field label="Категория"><input value={category} onChange={(e) => setCategory(e.target.value)} maxLength={80} required /></Field><Field label="Цель"><input type="number" min="1" value={target} onChange={(e) => setTarget(e.target.value)} required /></Field></div><Field label="Единица измерения"><input value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={40} placeholder="раз в неделю" required /></Field><Field label="Описание"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={4000} /></Field><Field label="Требования к выполнению"><textarea value={requirements} onChange={(e) => setRequirements(e.target.value)} rows={4} maxLength={6000} required /></Field><FormActions pending={pending} onCancel={onCancel} label="Создать шаблон" /></form>;
}
function AssignStandardForm({ standards, members, pending, onCancel, onSubmit }: { standards: Standard[]; members: Member[]; pending: boolean; onCancel: () => void; onSubmit: (standardId: string, memberId: string, dueAt: string) => void }) {
  const [standardId, setStandardId] = useState(standards[0]?.id ?? ''); const [assigneeId, setAssigneeId] = useState(''); const [dueAt, setDueAt] = useState('');
   return <form className="dialog-form" onSubmit={(e) => { e.preventDefault(); onSubmit(standardId, assigneeId, dueAt); }}><Field label="Шаблон норматива"><select value={standardId} onChange={(e) => setStandardId(e.target.value)} required>{standards.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select></Field><Field label="Сотрудник"><select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} required><option value="">Выберите сотрудника</option>{members.filter((m) => m.role === 'employee' && m.status === 'active').map((m) => <option key={m.id} value={m.id}>{m.nickname} · {m.rank}</option>)}</select></Field><Field label="Срок"><input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} required /></Field>{!standards.length && <div className="form-error">Сначала создайте шаблон норматива.</div>}<FormActions pending={pending} onCancel={onCancel} label="Назначить" /></form>;
}
function StandardAssignmentHistory({ id, manager, onClose, onReviewed }: { id: string; manager: boolean; onClose: () => void; onReviewed: () => void }) {
  const query = useListStandardSubmissions(id, { query: { queryKey: getListStandardSubmissionsQueryKey(id), refetchOnMount: 'always' } });
  const review = useReviewStandardSubmission(); const [decision, setDecision] = useState<'approved' | 'rejected' | 'revision_required'>('approved'); const [reason, setReason] = useState('');
  if (query.isLoading) return <PageSkeleton />;
  if (query.isError) return <InlineError message="История нормативов недоступна." onRetry={() => void query.refetch()} />;
  const pending = query.data?.find((s) => s.status === 'pending_review');
  const submitReview = () => { if (!pending || reason.trim().length < 1) return; review.mutate({ id: pending.id, data: { status: decision, reason: reason.trim() } }, { onSuccess: () => { void query.refetch(); onReviewed(); setReason(''); }, onError: () => alert('Не удалось сохранить решение.') }); };
  return <div className="submission-history">{!query.data?.length ? <EmptyState title="Отправок ещё нет" text="Когда сотрудник прикрепит подтверждение, история появится здесь." /> : query.data.map((item) => <SubmissionVersion key={item.id} item={item} />)}
    {manager && pending && <div className="review-box"><div className="section-kicker"><span /> РЕШЕНИЕ ПО ВЕРСИИ {pending.version}</div><Field label="Решение"><select value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)}><option value="approved">Принять</option><option value="revision_required">Вернуть на доработку</option><option value="rejected">Отклонить</option></select></Field><Field label="Обязательная причина / комментарий"><textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} rows={3} required placeholder="Объясните решение сотруднику" /></Field><div className="dialog-actions"><button className="button button-secondary" onClick={onClose}>Закрыть</button><button className="button button-primary" disabled={review.isPending || !reason.trim()} onClick={submitReview}>{review.isPending ? 'Сохраняем…' : 'Зафиксировать решение'} <Check size={15} /></button></div></div>}
  </div>;
}
function SubmissionVersion({ item }: { item: StandardSubmission | TaskSubmission }) {
  return <article className="version-entry"><div className="version-heading"><span className="version-number">V{String(item.version).padStart(2, '0')}</span><div><strong>Версия {item.version}</strong><span>{dateText(item.submittedAt, true)}</span></div><Badge status={item.status} /></div>{item.comment && <p className="version-comment">{item.comment}</p>}{item.decisionReason && <div className="review-note"><strong>{item.reviewerNickname ? `Решение · ${item.reviewerNickname}` : 'Комментарий руководства'}</strong><span>{item.decisionReason}</span></div>}<FileGallery files={item.files} /></article>;
}
function FileGallery({ files }: { files: SubmissionFile[] }) {
  return <div className="evidence-gallery">{files.map((file) => <a key={file.id} className="evidence-thumb" href={`/api/storage${file.objectPath}`} target="_blank" rel="noreferrer"><img src={`/api/storage${file.objectPath}`} alt={file.originalName} /><span><FileImage size={12} />{file.originalName}</span></a>)}</div>;
}

function SubmitModal({ title, detail, onClose, onSubmitted, id, pendingHook }: { title: string; detail: string; onClose: () => void; onSubmitted: () => void; id: string; pendingHook: 'standard' | 'task' }) {
  const qc = useQueryClient(); const upload = useRequestUploadUrl(); const standardSubmit = useSubmitStandard(); const taskSubmit = useSubmitTask();
  const [files, setFiles] = useState<File[]>([]); const [comment, setComment] = useState(''); const [error, setError] = useState(''); const busy = upload.isPending || standardSubmit.isPending || taskSubmit.isPending;
  const previews = useMemo(() => files.map((file) => ({ file, url: URL.createObjectURL(file) })), [files]);
  useEffect(() => () => previews.forEach(({ url }) => URL.revokeObjectURL(url)), [previews]);
  const addFiles = (list: FileList | null) => {
    if (!list) return; const next = Array.from(list); const valid: File[] = []; let issue = '';
    for (const f of next) { if (!imageTypes.includes(f.type)) issue = `${f.name}: используйте JPG, PNG или WebP.`; else if (f.size > maxImageSize) issue = `${f.name}: размер больше 10 МБ.`; else valid.push(f); }
    if (files.length + valid.length > 8) issue = 'Можно прикрепить не более 8 изображений.';
    if (issue) setError(issue); else setError(''); setFiles((current) => [...current, ...valid].slice(0, 8));
  };
  const send = async (e: FormEvent) => {
    e.preventDefault(); setError('');
     if (!files.length) { setError('Прикрепите хотя бы один скриншот.'); return; }
     if (pendingHook === 'standard' && !comment.trim()) { setError('Добавьте комментарий к результату норматива.'); return; }
    try {
      const uploadIds: string[] = [];
      for (const file of files) {
        const ticket = await upload.mutateAsync({ data: { name: file.name, size: file.size, contentType: file.type as 'image/jpeg' | 'image/png' | 'image/webp' } });
        const response = await fetch(ticket.uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
        if (!response.ok) throw new Error(`Не удалось загрузить ${file.name}`);
        uploadIds.push(ticket.uploadId);
      }
      const payload = { comment: comment.trim(), uploadIds };
      const onSuccess = () => { invalidate(qc, pendingHook === 'standard' ? getListStandardAssignmentsQueryKey() : getListTasksQueryKey(), pendingHook === 'standard' ? getListStandardSubmissionsQueryKey(id) : getListTaskSubmissionsQueryKey(id)); onSubmitted(); };
      if (pendingHook === 'standard') standardSubmit.mutate({ id, data: payload }, { onSuccess, onError: () => setError('Файлы загружены, но отправка не прошла. Повторите попытку.') });
      else taskSubmit.mutate({ id, data: payload }, { onSuccess, onError: () => setError('Файлы загружены, но отправка не прошла. Повторите попытку.') });
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'Не удалось загрузить скриншоты.'); }
  };
  return <Modal title={title} subtitle={detail} onClose={onClose} className="upload-modal"><form className="dialog-form" onSubmit={send}>
    <div className="upload-instruction"><Camera size={19} /><div><strong>Подтвердите выполнение скриншотами</strong><span>Изображения JPG, PNG или WebP · до 10 МБ каждое · максимум 8 файлов</span></div></div>
    <label className="file-drop upload-drop"><ImagePlus size={22} /><strong>Выбрать скриншоты</strong><span>Выберите изображения из галереи или файлов</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => { addFiles(e.target.files); e.currentTarget.value = ''; }} disabled={busy || files.length >= 8} data-testid="input-submission-images" /></label>
    {!!files.length && <div className="local-preview-grid">{previews.map(({ file, url }, index) => <div className="local-preview" key={`${file.name}-${index}`}><img src={url} alt={file.name} /><button type="button" aria-label={`Убрать ${file.name}`} onClick={() => setFiles((f) => f.filter((_, i) => i !== index))}><X size={13} /></button><span>{file.name}</span></div>)}</div>}
     <Field label={pendingHook === 'standard' ? 'Комментарий к результату (обязательно)' : 'Комментарий к отправке'}><textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} rows={3} required={pendingHook === 'standard'} placeholder="Что важно проверить?" /></Field>{error && <div className="form-error" role="alert">{error}</div>}
    <div className="dialog-actions"><button type="button" className="button button-secondary" onClick={onClose}>Отмена</button><button className="button button-primary" disabled={busy || !files.length}><Upload size={15} />{busy ? 'Загрузка и отправка…' : 'Отправить на проверку'}</button></div>
  </form></Modal>;
}

function TasksPage({ user }: { user: SessionUser }) {
  const qc = useQueryClient(); const manager = user.role !== 'employee';
  const list = useListTasks({ query: { queryKey: getListTasksQueryKey(), refetchOnMount: 'always' } });
  const members = useListMembers({ query: { queryKey: getListMembersQueryKey(), enabled: manager } });
  const create = useCreateTask(); const update = useUpdateTask(); const cancelTask = useCancelTask();
  const [filter, setFilter] = useState('all'); const [createOpen, setCreateOpen] = useState(false); const [submissionFor, setSubmissionFor] = useState<Task | null>(null); const [historyFor, setHistoryFor] = useState<string | null>(null); const [cancelFor, setCancelFor] = useState<Task | null>(null);
  const tasks = useMemo(() => (list.data ?? []).filter((t) => filter === 'all' || t.status === filter), [list.data, filter]);
  const save = (payload: { title: string; description: string; reason: string; assigneeId: string; priority: 'low' | 'normal' | 'high' | 'urgent'; dueAt: string }) => create.mutate({ data: { ...payload, dueAt: new Date(payload.dueAt).toISOString() } }, { onSuccess: () => { invalidate(qc, getListTasksQueryKey()); setCreateOpen(false); }, onError: () => alert('Не удалось создать поручение.') });
  const cancel = (reason: string) => { if (!cancelFor) return; cancelTask.mutate({ id: cancelFor.id, data: { reason } }, { onSuccess: () => { invalidate(qc, getListTasksQueryKey()); setCancelFor(null); }, onError: () => alert('Не удалось отменить поручение.') }); };
  if (list.isLoading) return <PageSkeleton />;
  if (list.isError) return <InlineError message="Не удалось загрузить поручения." onRetry={() => void list.refetch()} />;
  const filters = [['all', 'Все'], ['assigned', 'Назначено'], ['in_progress', 'В работе'], ['pending_review', 'На проверке'], ['revision_required', 'Доработка'], ['approved', 'Приняты'] ];
  return <><PageHeading eyebrow={manager ? 'ИСПОЛНЕНИЕ / КОНТРОЛЬ' : 'МОЯ СМЕНА / ПОРУЧЕНИЯ'} title="Поручения" description={manager ? 'Назначайте задачи, проверяйте доказательства и сохраняйте историю решений.' : 'Выполняйте служебные задачи и отправляйте подтверждения на проверку.'} action={manager && <button className="button button-primary" onClick={() => setCreateOpen(true)}><Plus size={16} /> Новое поручение</button>} />
    <div className="filter-tabs" role="tablist" aria-label="Фильтр поручений">{filters.map(([key, label]) => <button key={key} className={filter === key ? 'selected' : ''} onClick={() => setFilter(key)} role="tab" aria-selected={filter === key}>{label}</button>)}</div>
    {!tasks.length ? <EmptyState title={filter === 'all' ? 'Поручений пока нет' : 'В этой категории пусто'} text={manager ? 'Создайте задачу с исполнителем и понятным основанием.' : 'Новые поручения появятся здесь.'} action={manager && filter === 'all' && <button className="button button-primary" onClick={() => setCreateOpen(true)}><Plus size={16} /> Создать поручение</button>} /> : <div className="tasks-list">{tasks.map((task) => <TaskCard key={task.id} task={task} manager={manager} onSubmit={() => setSubmissionFor(task)} onHistory={() => setHistoryFor(task.id)} onCancel={() => setCancelFor(task)} onEdit={(data) => update.mutate({ id: task.id, data }, { onSuccess: () => invalidate(qc, getListTasksQueryKey()), onError: () => alert('Не удалось обновить поручение.') })} />)}</div>}
    {createOpen && <Modal title="Новое поручение" subtitle="Укажите задачу, основание и срок исполнения." onClose={() => setCreateOpen(false)}><TaskCreateForm members={members.data ?? []} pending={create.isPending} onCancel={() => setCreateOpen(false)} onSubmit={save} /></Modal>}
    {submissionFor && <SubmitModal title="Отправить выполнение" detail={submissionFor.title} id={submissionFor.id} pendingHook="task" onClose={() => setSubmissionFor(null)} onSubmitted={() => setSubmissionFor(null)} />}
    {historyFor && <Modal title="История поручения" subtitle="Все версии и решения по доказательствам." onClose={() => setHistoryFor(null)} className="history-modal"><TaskHistory id={historyFor} manager={manager} onClose={() => setHistoryFor(null)} onUpdated={() => invalidate(qc, getListTasksQueryKey())} /></Modal>}
    {cancelFor && <ReasonDialog title="Отменить поручение" detail={`История задачи «${cancelFor.title}» останется в системе.`} label="Причина отмены обязательна" pending={cancelTask.isPending} onClose={() => setCancelFor(null)} onSubmit={cancel} />}
  </>;
}
function TaskCard({ task, manager, onSubmit, onHistory, onCancel, onEdit }: { task: Task; manager: boolean; onSubmit: () => void; onHistory: () => void; onCancel: () => void; onEdit: (data: { status?: 'in_progress' }) => void }) {
   return <article className={`task-card task-card-rich status-edge-${task.status}`} data-testid={`card-task-${task.id}`}><div className={`task-priority-mark priority-${task.priority}`} /><div className="task-card-main"><div className="task-card-tags"><Badge status={task.status} /><span className={`priority-tag priority-${task.priority}`}>{LABEL[task.priority]} приоритет</span>{task.status === 'overdue' && <span className="overdue-note">Срок прошёл · без автоматического взыскания</span>}</div><h2>{task.title}</h2><p>{task.description || 'Описание не добавлено.'}</p>{task.reason && <div className="task-reason"><span>ОСНОВАНИЕ</span>{task.reason}</div>}<div className="task-card-meta"><span><Users size={13} />{task.assigneeNickname || 'Не назначен'}</span><span><CalendarDays size={13} />Выдано: {dateText(task.issuedAt, true)}</span><span><Clock3 size={13} />Срок: {dateText(task.dueAt, true)}</span><span>Версий: {task.versionCount}</span></div>{task.latestReviewReason && <div className="review-note"><strong>Решение руководства</strong><span>{task.latestReviewReason}</span></div>}</div><div className="task-card-actions"><button className="button button-secondary button-small" onClick={onHistory}><History size={14} /> История</button>{manager ? <>{task.status === 'pending_review' && <button className="button button-primary button-small" onClick={onHistory}><FileCheck2 size={14} /> Проверить</button>}{!['cancelled', 'approved'].includes(task.status) && <button className="button button-danger-outline button-small" onClick={onCancel}><Ban size={14} /> Отменить</button>}</> : <>{['assigned', 'revision_required', 'rejected', 'overdue'].includes(task.status) && <button className="button button-primary button-small" onClick={onSubmit}><Camera size={14} /> {task.versionCount ? 'Пересдать' : 'Отправить результат'}</button>}{task.status === 'assigned' && <button className="button button-secondary button-small" onClick={() => onEdit({ status: 'in_progress' })}>В работу</button>}</>}</div></article>;
}
function TaskCreateForm({ members, pending, onCancel, onSubmit }: { members: Member[]; pending: boolean; onCancel: () => void; onSubmit: (v: { title: string; description: string; reason: string; assigneeId: string; priority: 'low' | 'normal' | 'high' | 'urgent'; dueAt: string }) => void }) {
  const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [reason, setReason] = useState(''); const [assigneeId, setAssigneeId] = useState(''); const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal'); const [dueAt, setDueAt] = useState('');
   return <form className="dialog-form" onSubmit={(e) => { e.preventDefault(); onSubmit({ title, description, reason, assigneeId, priority, dueAt }); }}><Field label="Название"><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required /></Field><Field label="Описание задачи"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={4000} /></Field><Field label="Основание поручения"><textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={2000} required /></Field><div className="form-split"><Field label="Исполнитель"><select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} required><option value="">Выберите сотрудника</option>{members.filter((m) => m.role === 'employee' && m.status === 'active').map((m) => <option key={m.id} value={m.id}>{m.nickname} · {m.rank}</option>)}</select></Field><Field label="Приоритет"><select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}><option value="low">Низкий</option><option value="normal">Обычный</option><option value="high">Высокий</option><option value="urgent">Срочный</option></select></Field></div><Field label="Срок исполнения"><input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} required /></Field><FormActions pending={pending} onCancel={onCancel} label="Поставить задачу" /></form>;
}
function TaskHistory({ id, manager, onClose, onUpdated }: { id: string; manager: boolean; onClose: () => void; onUpdated: () => void }) {
  const query = useListTaskSubmissions(id, { query: { queryKey: getListTaskSubmissionsQueryKey(id), refetchOnMount: 'always' } }); const review = useReviewTaskSubmission();
  const [decision, setDecision] = useState<'approved' | 'rejected' | 'revision_required'>('approved'); const [reason, setReason] = useState('');
  if (query.isLoading) return <PageSkeleton />;
  if (query.isError) return <InlineError message="История поручения недоступна." onRetry={() => void query.refetch()} />;
  const current = query.data?.find((s) => s.status === 'pending_review');
  const save = () => { if (!current || !reason.trim()) return; review.mutate({ id: current.id, data: { status: decision, reason: reason.trim() } }, { onSuccess: () => { void query.refetch(); onUpdated(); setReason(''); }, onError: () => alert('Не удалось сохранить решение.') }); };
  return <div className="submission-history">{!query.data?.length ? <EmptyState title="Версий пока нет" text="Сотрудник ещё не отправлял скриншоты." /> : query.data.map((s) => <SubmissionVersion key={s.id} item={s} />)}{manager && current && <div className="review-box"><div className="section-kicker"><span /> ПРОВЕРКА ВЕРСИИ {current.version}</div><Field label="Решение"><select value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)}><option value="approved">Принять</option><option value="revision_required">Вернуть на доработку</option><option value="rejected">Отклонить</option></select></Field><Field label="Причина решения (обязательно)"><textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} rows={3} required /></Field><div className="dialog-actions"><button className="button button-secondary" onClick={onClose}>Закрыть</button><button className="button button-primary" onClick={save} disabled={review.isPending || !reason.trim()}>{review.isPending ? 'Сохраняем…' : 'Сохранить решение'} <Check size={15} /></button></div></div>}</div>;
}
function ReasonDialog({ title, detail, label, pending, onClose, onSubmit }: { title: string; detail: string; label: string; pending: boolean; onClose: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState(''); return <Modal title={title} subtitle={detail} onClose={onClose}><form className="dialog-form" onSubmit={(e) => { e.preventDefault(); onSubmit(reason.trim()); }}><Field label={label}><textarea value={reason} onChange={(e) => setReason(e.target.value)} minLength={1} maxLength={2000} rows={4} required /></Field><FormActions pending={pending} onCancel={onClose} label="Подтвердить отмену" danger /></form></Modal>;
}
function FormActions({ pending, onCancel, label, danger = false }: { pending: boolean; onCancel: () => void; label: string; danger?: boolean }) { return <div className="dialog-actions"><button className="button button-secondary" type="button" onClick={onCancel}>Отмена</button><button className={`button ${danger ? 'button-danger-outline' : 'button-primary'}`} type="submit" disabled={pending}>{pending ? 'Сохраняем…' : label}</button></div>; }

function NotificationsPage() {
  const [, navigate] = useLocation();
  const qc = useQueryClient(); const query = useListNotifications({ query: { queryKey: getListNotificationsQueryKey(), refetchOnMount: 'always' } });
  const readOne = useMarkNotificationRead(); const readAll = useMarkAllNotificationsRead();
  const markOne = (item: Notification) => { if (item.readAt) return; readOne.mutate({ id: item.id }, { onSuccess: () => invalidate(qc, getListNotificationsQueryKey()), onError: () => alert('Не удалось отметить уведомление.') }); };
  const follow = (item: Notification) => { markOne(item); if (item.relatedType === 'task' && item.relatedId) navigate('/tasks'); if (item.relatedType === 'standard_assignment' && item.relatedId) navigate('/standards'); };
  return <><PageHeading eyebrow="СИГНАЛЫ / ВХОДЯЩИЕ" title="Уведомления" description="Назначения, отправки на проверку и решения руководства." action={!!query.data?.some((n) => !n.readAt) && <button className="button button-secondary" onClick={() => readAll.mutate(undefined, { onSuccess: () => invalidate(qc, getListNotificationsQueryKey()), onError: () => alert('Не удалось отметить уведомления.') })} disabled={readAll.isPending}><CheckCheck size={16} /> Прочитать все</button>} />
    {query.isLoading ? <PageSkeleton /> : query.isError ? <InlineError message="Не удалось загрузить уведомления." onRetry={() => void query.refetch()} /> : !query.data?.length ? <EmptyState title="Входящих пока нет" text="Здесь появятся обновления по поручениям и нормативам." /> : <div className="notifications-list">{query.data.map((n) => <button type="button" className={`notification-row ${n.readAt ? 'is-read' : ''}`} key={n.id} onClick={() => follow(n)} data-testid={`notification-${n.id}`}><span className={`notification-mark ${n.readAt ? '' : 'unread'}`}><Bell size={16} /></span><span className="notification-copy"><span className="notification-top"><strong>{n.title}</strong><Badge status={n.kind} /></span><span>{n.message}</span><small>{dateText(n.createdAt, true)}</small></span><ArrowUpRight size={16} /></button>)}</div>}
  </>;
}

function MembersPage({ user }: { user: SessionUser }) {
  const qc = useQueryClient(); const query = useListMembers({ query: { queryKey: getListMembersQueryKey(), refetchOnMount: 'always' } });
  const create = useCreateMember(); const update = useUpdateMember(); const remove = useDeleteMember(); const [search, setSearch] = useState(''); const [editing, setEditing] = useState<Member | null>(null); const [creating, setCreating] = useState(false); const [credentials, setCredentials] = useState<{ nickname: string; password: string } | null>(null);
  const leader = user.role === 'leader'; const filtered = (query.data ?? []).filter((m) => `${m.nickname} ${m.rank}`.toLowerCase().includes(search.toLowerCase()));
  const save = (data: { nickname?: string; rank?: string; role?: 'admin' | 'employee'; status?: 'active' | 'blocked' }) => {
    if (editing) update.mutate({ id: editing.id, data }, { onSuccess: () => { invalidate(qc, getListMembersQueryKey()); setEditing(null); }, onError: () => alert('Не удалось сохранить изменения.') });
    else create.mutate({ data: { nickname: data.nickname!, rank: data.rank!, role: data.role! } }, { onSuccess: (result) => { invalidate(qc, getListMembersQueryKey()); setCreating(false); setCredentials({ nickname: result.member.nickname, password: result.temporaryPassword }); }, onError: () => alert('Не удалось добавить участника.') });
  };
  return <><PageHeading eyebrow="УПРАВЛЕНИЕ / СОСТАВ" title="Личный состав" description="Роли, звания и статус доступа сотрудников." action={<button className="button button-primary" onClick={() => setCreating(true)}><Plus size={16} /> Добавить участника</button>} /><div className="list-toolbar"><div className="search-box"><Search size={16} /><input placeholder="Поиск по имени или званию" value={search} onChange={(e) => setSearch(e.target.value)} /></div><span className="toolbar-count">{filtered.length} УЧАСТНИКОВ</span></div>{query.isLoading ? <PageSkeleton /> : query.isError ? <InlineError message="Не удалось загрузить состав." onRetry={() => void query.refetch()} /> : !filtered.length ? <EmptyState title="Никого не найдено" text="Измените запрос или добавьте сотрудника." /> : <div className="table-panel"><div className="table-scroll"><table className="data-table"><thead><tr><th>СОТРУДНИК</th><th>РОЛЬ</th><th>ЗВАНИЕ</th><th>СТАТУС</th><th>ПОСЛЕДНИЙ ВХОД</th><th /></tr></thead><tbody>{filtered.map((m) => <tr key={m.id}><td><div className="table-person"><div className="avatar avatar-table">{initials(m.nickname)}</div><div><strong>{m.nickname}</strong><span>В составе с {dateText(m.createdAt)}</span></div></div></td><td>{ROLE_LABEL[m.role]}</td><td>{m.rank}</td><td><Badge status={m.status} /></td><td>{dateText(m.lastLogin, true)}</td><td><div className="member-actions"><button className="icon-button" aria-label={`Изменить ${m.nickname}`} onClick={() => setEditing(m)}><Pencil size={15} /></button>{m.role === 'employee' && <button className="icon-button danger-icon" aria-label={`Исключить ${m.nickname} из состава`} title="Исключить из состава" disabled={remove.isPending} onClick={() => { if (confirm(`Исключить ${m.nickname} из состава? Его доступ будет отключён, а история нормативов и поручений сохранится.`)) remove.mutate({ id: m.id }, { onSuccess: () => { invalidate(qc, getListMembersQueryKey(), getGetDashboardQueryKey()); }, onError: () => alert('Не удалось исключить сотрудника из состава.') }); }}><Trash2 size={15} /></button>}</div></td></tr>)}</tbody></table></div></div>}<div className="list-bottom-note"><Shield size={14} />{leader ? 'Лидер управляет ролями и может исключать сотрудников из состава.' : 'Администратор может изменять звания и исключать сотрудников из состава.'}</div>
    {(creating || editing) && <Modal title={editing ? 'Карточка сотрудника' : 'Новый участник'} subtitle={editing?.nickname ?? 'Создание доступа в систему Правительства области'} onClose={() => { setCreating(false); setEditing(null); }}><MemberForm initial={editing} leader={leader} pending={create.isPending || update.isPending} onCancel={() => { setCreating(false); setEditing(null); }} onSubmit={save} /></Modal>}
    {credentials && <Modal title="Доступ создан" subtitle={`Учётная запись ${credentials.nickname}`} onClose={() => setCredentials(null)}><div className="credentials-panel"><strong>Временный пароль</strong><code>{credentials.password}</code><p>Показывается один раз. Передайте его сотруднику безопасно.</p><button className="button button-secondary" onClick={() => void navigator.clipboard?.writeText(credentials.password)}>Копировать</button></div></Modal>}
  </>;
}
function MemberForm({ initial, leader, pending, onCancel, onSubmit }: { initial: Member | null; leader: boolean; pending: boolean; onCancel: () => void; onSubmit: (data: { nickname?: string; rank?: string; role?: 'admin' | 'employee'; status?: 'active' | 'blocked' }) => void }) {
  const [nickname, setNickname] = useState(initial?.nickname ?? ''); const [rank, setRank] = useState(initial?.rank ?? ''); const [role, setRole] = useState<'admin' | 'employee'>(initial?.role === 'admin' ? 'admin' : 'employee'); const [status, setStatus] = useState<'active' | 'blocked'>(initial?.status === 'blocked' ? 'blocked' : 'active');
  return <form className="dialog-form" onSubmit={(e) => { e.preventDefault(); onSubmit(initial ? { rank, ...(leader ? { role, status } : {}) } : { nickname, rank, role }); }}><>{!initial && <Field label="Игровое имя"><input value={nickname} onChange={(e) => setNickname(e.target.value)} minLength={3} maxLength={32} required /></Field>}<Field label="Звание"><input value={rank} onChange={(e) => setRank(e.target.value)} maxLength={80} required /></Field>{leader && <><Field label="Роль"><select value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'employee')}><option value="employee">Сотрудник</option><option value="admin">Администратор</option></select></Field>{initial && <Field label="Доступ"><select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}><option value="active">Активен</option><option value="blocked">Заблокирован</option></select></Field>}</>}</><FormActions pending={pending} onCancel={onCancel} label={initial ? 'Сохранить' : 'Создать доступ'} /></form>;
}

function EventsPage() {
  const qc = useQueryClient(); const query = useListEvents({ query: { queryKey: getListEventsQueryKey(), refetchOnMount: 'always' } }); const create = useCreateEvent(); const update = useUpdateEvent(); const remove = useDeleteEvent();
  const [open, setOpen] = useState(false); const [editing, setEditing] = useState<Event | null>(null);
  const save = (payload: { title: string; description: string; startsAt: string; location: string }) => {
    const done = () => { invalidate(qc, getListEventsQueryKey()); setOpen(false); setEditing(null); };
    if (editing) update.mutate({ id: editing.id, data: payload }, { onSuccess: done, onError: () => alert('Не удалось обновить мероприятие.') }); else create.mutate({ data: payload }, { onSuccess: done, onError: () => alert('Не удалось создать мероприятие.') });
  };
  return <><PageHeading eyebrow="ПЛАНИРОВАНИЕ / КАЛЕНДАРЬ" title="Мероприятия" description="Расписание встреч и служебных мероприятий Правительства области." action={<button className="button button-primary" onClick={() => setOpen(true)}><Plus size={16} /> Новое мероприятие</button>} />{query.isLoading ? <PageSkeleton /> : query.isError ? <InlineError message="Не удалось загрузить расписание." onRetry={() => void query.refetch()} /> : !query.data?.length ? <EmptyState title="Расписание чистое" text="Добавьте первое мероприятие для команды." action={<button className="button button-primary" onClick={() => setOpen(true)}>Запланировать</button>} /> : <div className="event-grid">{query.data.map((ev) => <article className="event-card" key={ev.id}><div className="event-date-block"><span>{new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(new Date(ev.startsAt)).toUpperCase()}</span><strong>{new Date(ev.startsAt).getDate().toString().padStart(2, '0')}</strong></div><div className="event-body"><div className="event-topline"><Badge status={ev.status} /><span>{dateText(ev.startsAt, true)}</span></div><h2>{ev.title}</h2><p>{ev.description}</p><span className="event-location"><MapPin size={14} />{ev.location}</span></div><div className="event-actions"><button className="icon-button" aria-label="Изменить" onClick={() => { setEditing(ev); setOpen(true); }}><Pencil size={15} /></button><button className="icon-button danger-icon" aria-label="Удалить" onClick={() => confirm(`Удалить мероприятие «${ev.title}»?`) && remove.mutate({ id: ev.id }, { onSuccess: () => invalidate(qc, getListEventsQueryKey()), onError: () => alert('Не удалось удалить мероприятие.') })}><Trash2 size={15} /></button></div></article>)}</div>}{open && <Modal title={editing ? 'Изменить мероприятие' : 'Новое мероприятие'} subtitle="Планирование сбора личного состава" onClose={() => { setOpen(false); setEditing(null); }}><EventForm initial={editing} pending={create.isPending || update.isPending} onCancel={() => { setOpen(false); setEditing(null); }} onSubmit={save} /></Modal>}</>;
}
function EventForm({ initial, pending, onCancel, onSubmit }: { initial: Event | null; pending: boolean; onCancel: () => void; onSubmit: (data: { title: string; description: string; startsAt: string; location: string }) => void }) {
  const localDate = (v?: string) => v ? new Date(new Date(v).getTime() - new Date(v).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
  const [title, setTitle] = useState(initial?.title ?? ''); const [description, setDescription] = useState(initial?.description ?? ''); const [startsAt, setStartsAt] = useState(localDate(initial?.startsAt)); const [location, setLocation] = useState(initial?.location ?? '');
  return <form className="dialog-form" onSubmit={(e) => { e.preventDefault(); onSubmit({ title, description, startsAt: new Date(startsAt).toISOString(), location }); }}><Field label="Название"><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required /></Field><div className="form-split"><Field label="Дата и время"><input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required /></Field><Field label="Место"><input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={240} required /></Field></div><Field label="Описание"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={4000} /></Field><FormActions pending={pending} onCancel={onCancel} label="Сохранить" /></form>;
}

function DisciplinePage() {
  const qc = useQueryClient();
  const records = useDisciplineRecords();
  const members = useListMembers();
  const issue = useIssueDiscipline();
  const revoke = useRevokeDiscipline();
  const [open, setOpen] = useState(false);
  const [revoking, setRevoking] = useState<DisciplineRecord | null>(null);
  const [memberFilter, setMemberFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<'all' | DisciplineType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'revoked' | 'converted'>('all');

  const employees = (members.data ?? []).filter((member) => member.role === 'employee');
  const summaries = useMemo(() => employees.map((member) => {
    const history = (records.data ?? []).filter((record) => record.memberId === member.id);
    return {
      member,
      warnings: history.filter((record) => record.type === 'warning' && record.status === 'active').length,
      reprimands: history.filter((record) => record.type === 'reprimand' && record.status === 'active').length,
      maxLevelReached: history.some((record) => !!record.maxLevelReachedAt),
    };
  }), [employees, records.data]);
  const visibleRecords = useMemo(() => (records.data ?? []).filter((record) =>
    (memberFilter === 'all' || record.memberId === memberFilter) &&
    (typeFilter === 'all' || record.type === typeFilter) &&
    (statusFilter === 'all' || record.status === statusFilter),
  ), [records.data, memberFilter, typeFilter, statusFilter]);
  const selectedMember = employees.find((member) => member.id === memberFilter);
  const selectedSummary = summaries.find((item) => item.member.id === memberFilter);

  const issueRecord = (data: { memberId: string; type: DisciplineType; reason: string; requestId: string }) =>
    issue.mutate(data, {
      onSuccess: () => {
        invalidate(qc, getDisciplineRecordsQueryKey());
        void qc.invalidateQueries({ queryKey: ['/api/audit-logs'] });
        setOpen(false);
      },
      onError: (error) => alert((error as Error).message || 'Не удалось зарегистрировать взыскание.'),
    });
  const revokeRecord = (reason: string) => {
    if (!revoking) return;
    revoke.mutate({ id: revoking.id, reason }, {
      onSuccess: () => {
        invalidate(qc, getDisciplineRecordsQueryKey());
        void qc.invalidateQueries({ queryKey: ['/api/audit-logs'] });
        setRevoking(null);
      },
      onError: (error) => alert((error as Error).message || 'Не удалось снять взыскание.'),
    });
  };

  return <>
    <PageHeading eyebrow="ОТВЕТСТВЕННОСТЬ / РЕЕСТР" title="Дисциплина" description="Активные взыскания, основания и полная история по каждому сотруднику." action={<button className="button button-primary" onClick={() => setOpen(true)}><Plus size={16} /> Зафиксировать взыскание</button>} />
    {records.isLoading || members.isLoading ? <PageSkeleton /> : records.isError || members.isError ? <InlineError message="Не удалось загрузить дисциплинарный реестр." onRetry={() => { void records.refetch(); void members.refetch(); }} /> : <>
      <div className="discipline-controls">
        <label className="field-inline-label">СОТРУДНИК
          <select value={memberFilter} onChange={(event) => setMemberFilter(event.target.value)}>
            <option value="all">Весь состав</option>
            {employees.map((member) => <option key={member.id} value={member.id}>{member.nickname}</option>)}
          </select>
        </label>
        <label className="field-inline-label">ВИД
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}>
            <option value="all">Все взыскания</option><option value="warning">Предупреждения</option><option value="reprimand">Выговоры</option>
          </select>
        </label>
        <label className="field-inline-label">ИСТОРИЯ
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
            <option value="all">Вся история</option><option value="active">Активные</option><option value="revoked">Снятые</option><option value="converted">Конвертированные</option>
          </select>
        </label>
      </div>
      {selectedSummary ? <DisciplineSummary
        nickname={selectedSummary.member.nickname}
        warnings={selectedSummary.warnings}
        reprimands={selectedSummary.reprimands}
        maxLevelReached={selectedSummary.maxLevelReached}
      /> : <section className="discipline-roster" aria-label="Активные взыскания по сотрудникам">
        {summaries.map((summary) => <button className="discipline-person-summary" key={summary.member.id} onClick={() => setMemberFilter(summary.member.id)}>
          <span className="discipline-person-name">{summary.member.nickname}<small>{summary.member.rank}</small></span>
          <span>Предупреждения: <strong>{summary.warnings}/2</strong></span>
          <span>Выговоры: <strong>{summary.reprimands}/3</strong></span>
          {summary.maxLevelReached && <em>Максимальный уровень достигнут</em>}
        </button>)}
      </section>}
      {selectedMember && <button className="text-link discipline-back" onClick={() => setMemberFilter('all')}>Показать весь состав</button>}
      {visibleRecords.length === 0 ? <EmptyState title="Записей по фильтру нет" text="Измените фильтры или зарегистрируйте взыскание." /> :
        <div className="discipline-list">{visibleRecords.map((record) => <DisciplineRecordCard
          key={record.id}
          record={record}
          onRevoke={() => setRevoking(record)}
        />)}</div>}
    </>}
    {open && <Modal title="Новое взыскание" subtitle="Запись сохраняется в истории и журнале действий." onClose={() => setOpen(false)}>
      <DisciplineForm members={employees} pending={issue.isPending} onCancel={() => setOpen(false)} onSubmit={issueRecord} />
    </Modal>}
    {revoking && <Modal title="Снять взыскание" subtitle="Запись останется в истории; причина снятия обязательна." onClose={() => setRevoking(null)}>
      <RevokeDisciplineForm pending={revoke.isPending} onCancel={() => setRevoking(null)} onSubmit={revokeRecord} />
    </Modal>}
  </>;
}

function DisciplineSummary({ nickname, warnings, reprimands, maxLevelReached }: { nickname: string; warnings: number; reprimands: number; maxLevelReached: boolean }) {
  return <div className="discipline-summary">
    <div className="discipline-icon"><ShieldAlert size={18} /></div>
    <div><strong>История сотрудника · {nickname}</strong><span>{maxLevelReached ? 'Максимальный дисциплинарный уровень зафиксирован; автоматического увольнения нет.' : 'Взыскания не снимаются автоматически.'}</span></div>
    <div className="discipline-count"><span>ПРЕДУПРЕЖДЕНИЯ</span><strong>{warnings}/2</strong></div>
    <div className="discipline-count"><span>ВЫГОВОРЫ</span><strong>{reprimands}/3</strong></div>
  </div>;
}

function DisciplineRecordCard({ record, onRevoke }: { record: DisciplineRecord; onRevoke: () => void }) {
  const title = record.type === 'warning' ? 'Предупреждение' : 'Выговор';
  return <article className="discipline-card">
    <div className={`discipline-score discipline-score-${record.type}`}><strong>{record.type === 'warning' ? 'ПРЕД.' : 'ВЫГ.'}</strong><span>{record.status === 'active' ? 'АКТИВНО' : LABEL[record.status]?.toUpperCase()}</span></div>
    <div className="discipline-record-copy">
      <div className="discipline-record-top"><strong>{record.memberNickname} · {title}</strong><span>{dateText(record.createdAt, true)}</span></div>
      <p>{record.reason}</p>
      <div className="discipline-record-foot"><span>Назначил: {record.issuedByNickname} · {dateText(record.createdAt, true)}</span>{record.evidencePath && <a href={`/api/storage${record.evidencePath}`} target="_blank" rel="noreferrer">Материалы</a>}</div>
      {record.status === 'revoked' && <div className="discipline-resolution"><strong>Снято {dateText(record.revokedAt, true)} · {record.revokedByNickname}</strong><span>Причина: {record.revocationReason}</span></div>}
      {record.status === 'converted' && <div className="discipline-resolution"><strong>Преобразовано {dateText(record.convertedAt, true)} · {record.convertedByNickname}</strong><span>{record.conversionReason}</span></div>}
    </div>
    {record.status === 'active' && <button type="button" className="button button-secondary button-small discipline-revoke" onClick={onRevoke}>Снять</button>}
  </article>;
}

function DisciplineForm({ members, pending, onCancel, onSubmit }: { members: Member[]; pending: boolean; onCancel: () => void; onSubmit: (data: { memberId: string; type: DisciplineType; reason: string; requestId: string }) => void }) {
  const [memberId, setMemberId] = useState('');
  const [type, setType] = useState<DisciplineType>('warning');
  const [reason, setReason] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const resetKey = () => setRequestId(crypto.randomUUID());
  return <form className="dialog-form" onSubmit={(event) => { event.preventDefault(); onSubmit({ memberId, type, reason: reason.trim(), requestId }); }}>
    <Field label="Сотрудник"><select value={memberId} onChange={(event) => { setMemberId(event.target.value); resetKey(); }} required><option value="">Выберите сотрудника</option>{members.map((member) => <option key={member.id} value={member.id}>{member.nickname}</option>)}</select></Field>
    <Field label="Вид взыскания"><select value={type} onChange={(event) => { setType(event.target.value as DisciplineType); resetKey(); }}><option value="warning">Предупреждение</option><option value="reprimand">Выговор</option></select></Field>
    <Field label="Причина"><textarea value={reason} onChange={(event) => { setReason(event.target.value); resetKey(); }} maxLength={4000} rows={4} required /></Field>
    <p className="form-help">Второе активное предупреждение автоматически конвертирует оба предупреждения в один выговор. Предел — три активных выговора; увольнения автоматически нет.</p>
    <FormActions pending={pending} onCancel={onCancel} label="Зафиксировать" />
  </form>;
}

function RevokeDisciplineForm({ pending, onCancel, onSubmit }: { pending: boolean; onCancel: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return <form className="dialog-form" onSubmit={(event) => { event.preventDefault(); onSubmit(reason.trim()); }}>
    <Field label="Причина снятия"><textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={2000} rows={4} required /></Field>
    <FormActions pending={pending} onCancel={onCancel} label="Снять и сохранить историю" />
  </form>;
}

const AUDIT_CATEGORY_LABEL: Record<AuditCategory, string> = {
  accounts: 'Аккаунты', events: 'Мероприятия', standards: 'Нормативы',
  tasks: 'Задания', discipline: 'Дисциплина',
};
const AUDIT_ACTION_LABEL: Record<string, string> = {
  'account.created': 'Создан аккаунт',
  'account.updated': 'Изменён аккаунт',
  'account.role_changed': 'Изменена роль',
  'account.password_changed': 'Изменён пароль',
  'event.created': 'Создано мероприятие',
  'event.updated': 'Изменено мероприятие',
  'event.deleted': 'Удалено мероприятие',
  'standard.created': 'Создан норматив',
  'standard.updated': 'Изменён норматив',
  'standard.deleted': 'Удалён норматив',
  'standard.assignment_created': 'Назначен норматив',
  'standard.reviewed': 'Проверена сдача норматива',
  'task.created': 'Создано задание',
  'task.updated': 'Изменено задание',
  'task.started': 'Задание взято в работу',
  'task.submitted': 'Отправлен отчёт по заданию',
  'task.deleted': 'Удалено задание',
  'task.cancelled': 'Отменено задание',
  'task.reviewed': 'Проверена сдача задания',
  'discipline.warning_issued': 'Назначено предупреждение',
  'discipline.reprimand_issued': 'Назначен выговор',
  'discipline.warning_converted': 'Предупреждения конвертированы в выговор',
  'discipline.revoked': 'Снято взыскание',
  'discipline.max_level_reached': 'Зафиксирован максимальный уровень',
};

function AuditPage() {
  const members = useListMembers();
  const [category, setCategory] = useState<'' | AuditCategory>('');
  const [memberId, setMemberId] = useState('');
  const [action, setAction] = useState('');
  const filters = {
    ...(category ? { category } : {}),
    ...(memberId ? { memberId } : {}),
    ...(action.trim() ? { action: action.trim() } : {}),
    limit: 200,
  };
  const logs = useAuditLogRecords(filters);
  return <>
    <PageHeading eyebrow="КОНТРОЛЬ / ТОЛЬКО ЧТЕНИЕ" title="Журнал действий" description="Изменения аккаунтов, мероприятий, нормативов, заданий и взысканий. Удаление и редактирование записей не предусмотрены." />
    <div className="audit-filters">
      <label className="field-inline-label">РАЗДЕЛ
        <select value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
          <option value="">Все разделы</option>
          {Object.entries(AUDIT_CATEGORY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="field-inline-label">СОТРУДНИК
        <select value={memberId} onChange={(event) => setMemberId(event.target.value)}>
          <option value="">Все сотрудники</option>
          {(members.data ?? []).map((member) => <option key={member.id} value={member.id}>{member.nickname}</option>)}
        </select>
      </label>
      <label className="field-inline-label audit-search">ДЕЙСТВИЕ
        <input value={action} onChange={(event) => setAction(event.target.value)} maxLength={100} placeholder="Например, выговор" />
      </label>
    </div>
    {logs.isLoading ? <PageSkeleton /> : logs.isError ? <InlineError message="Не удалось загрузить журнал действий." onRetry={() => void logs.refetch()} /> : !logs.data?.length ? <EmptyState title="Событий не найдено" text="Измените фильтры или проверьте журнал позже." /> :
      <div className="audit-list">{logs.data.map((entry) => <AuditLogCard key={entry.id} entry={entry} />)}</div>}
  </>;
}

function AuditLogCard({ entry }: { entry: AuditLogEntry }) {
  return <article className="audit-row">
    <div className="audit-row-mark"><History size={15} /></div>
    <div className="audit-row-main">
      <div className="audit-row-heading"><strong>{AUDIT_ACTION_LABEL[entry.action] ?? entry.action}</strong><span>{dateText(entry.createdAt, true)}</span></div>
      <div className="audit-row-meta"><span>{entry.actorNickname}</span><i />{entry.targetMemberNickname && <><span>Сотрудник: {entry.targetMemberNickname}</span><i /></>}<span>{AUDIT_CATEGORY_LABEL[entry.category]}</span></div>
      <p>{entry.entityLabel}</p>
      {entry.reason && <small>Основание: {entry.reason}</small>}
    </div>
  </article>;
}

function SettingsPage({ user }: { user: SessionUser }) {
  const qc = useQueryClient(); const change = useChangePassword(); const logout = useLogout(); const [error, setError] = useState(''); const [success, setSuccess] = useState(false);
  const submit = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); setError(''); setSuccess(false); const form = new FormData(e.currentTarget); const currentPassword = String(form.get('currentPassword')); const newPassword = String(form.get('newPassword')); if (newPassword !== String(form.get('confirmPassword'))) { setError('Новые пароли не совпадают.'); return; } if (newPassword.length < 10) { setError('Новый пароль должен содержать не менее 10 символов.'); return; } change.mutate({ data: { currentPassword, newPassword } }, { onSuccess: () => { setSuccess(true); e.currentTarget.reset(); invalidate(qc, getGetCurrentUserQueryKey()); }, onError: (issue) => setError((issue as Error).message || 'Не удалось сменить пароль.') }); };
  const signOut = () => logout.mutate(undefined, { onSuccess: () => { qc.clear(); window.location.assign(import.meta.env.BASE_URL || '/'); } });
  return <><PageHeading eyebrow="АККАУНТ / ДОСТУП" title="Настройки" description="Безопасность учётной записи и текущей сессии." /><div className="settings-layout"><div className="settings-main"><Panel title="Сменить пароль" meta="БЕЗОПАСНОСТЬ"><div className="settings-intro"><div className="settings-icon"><KeyRound size={18} /></div><p>Минимальная длина нового пароля — 10 символов. Не передавайте пароль другим сотрудникам.</p></div><form className="settings-form" onSubmit={submit}><Field label="Текущий пароль"><input name="currentPassword" type="password" autoComplete="current-password" required /></Field><Field label="Новый пароль"><input name="newPassword" type="password" minLength={10} maxLength={128} autoComplete="new-password" required /></Field><Field label="Повторите пароль"><input name="confirmPassword" type="password" minLength={10} maxLength={128} autoComplete="new-password" required /></Field>{error && <div className="form-error">{error}</div>}{success && <div className="form-success">Пароль изменён.</div>}<button className="button button-primary" disabled={change.isPending}>{change.isPending ? 'Сохраняем…' : 'Обновить пароль'}</button></form></Panel><Panel title="Текущая сессия" meta="УПРАВЛЕНИЕ ДОСТУПОМ"><div className="session-details"><div><span>АККАУНТ</span><strong>{user.nickname}</strong></div><div><span>РОЛЬ</span><strong>{ROLE_LABEL[user.role]}</strong></div><div><span>ЗВАНИЕ</span><strong>{user.rank}</strong></div></div><button className="button button-danger-outline" onClick={signOut} disabled={logout.isPending}><LogOut size={15} /> Завершить сессию</button></Panel></div><aside className="settings-aside"><div className="account-card"><div className="avatar avatar-large">{initials(user.nickname)}</div><span className="account-role">{ROLE_LABEL[user.role]}</span><h2>{user.nickname}</h2><p>{user.rank}</p><div className="account-divider" /><div className="account-fact"><span>СОСТОЯНИЕ</span><strong><i className="status-pulse" /> Активен</strong></div></div></aside></div></>;
}
export default App;
