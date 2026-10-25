import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import {
  Activity, ArrowUpRight, BookOpen, CalendarDays, Check, CheckCheck,
  ClipboardList, Clock3, FileImage, Flag, LayoutDashboard, LogOut, Menu, Plus,
  Search, Settings, Shield, ShieldAlert, Users, X, KeyRound, Eye, EyeOff,
  Pencil, Trash2, ListChecks, CircleAlert, LoaderCircle, Bell, Camera,
  Upload, History, Ban, ImagePlus, FileCheck2,
} from 'lucide-react';
import {
  useChangePassword, useCreateEvent, useCreateMember,
  useCreateStandard, useCreateStandardAssignment, useCreateTask,
  useDeleteEvent, useDeleteMember, useDeleteStandard, useGetCurrentUser, getGetSetupStatusQueryKey,
  useGetDashboard, useGetSetupStatus, useHealthCheck,
  useListEventSubmissions, useListEvents, useListMembers, useListStandards, useListStandardAssignments,
  useListStandardSubmissions, useListTasks, useListTaskSubmissions, useListNotifications,
  useLogin, useLogout, useMarkAllNotificationsRead, useMarkNotificationRead,
  useRequestUploadUrl, useReviewStandardSubmission, useReviewTaskSubmission,
  useReviewEventSubmission, useSubmitEventSubmission, useSubmitStandard, useSubmitTask, useCancelTask, useUpdateEvent, useUpdateMember,
  useUpdateStandard, getGetCurrentUserQueryKey, getGetDashboardQueryKey,
  getHealthCheckQueryKey, getListMembersQueryKey, getListEventsQueryKey,
  getListStandardsQueryKey, getListStandardAssignmentsQueryKey,
  getListStandardSubmissionsQueryKey, getListTasksQueryKey, getListTaskSubmissionsQueryKey,
  getListEventSubmissionsQueryKey, getListNotificationsQueryKey,
} from '@workspace/api-client-react';
import {
  getDisciplineRecordsQueryKey,
  useAuditLogRecords, useDisciplineRecords, useIssueDiscipline, useRevokeDiscipline,
  type AuditCategory, type AuditLogEntry, type DisciplineRecord, type DisciplineType,
} from './discipline-client';
import {
  getInactivityRequestsQueryKey,
  useCreateInactivityRequest,
  useInactivityRequests,
  useReviewInactivityRequest,
  type InactivityRequest,
  type InactivityRequestStatus,
} from './inactivity-client';
import { getPointsQueryKey, useAwardPoints, useDeductPoints, usePoints } from './points-client';
import type {
  Event, EventSubmission, Member, Standard, StandardAssignment, Task, SessionUser, Notification,
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
  { href: '/inactivity', label: 'Неактив', icon: Clock3 },
  { href: '/standards', label: 'Нормативы', icon: BookOpen },
  { href: '/tasks', label: 'Поручения', icon: ClipboardList },
  { href: '/notifications', label: 'Уведомления', icon: Bell },
  { href: '/discipline', label: 'Дисциплина', icon: ShieldAlert, staff: true },
  { href: '/audit', label: 'Журнал действий', icon: History, staff: true },
  { href: '/settings', label: 'Настройки', icon: Settings },
];
const memberTitle = (role: string, rank: string) => role === 'leader' ? 'Лидер' : role === 'admin' ? 'Администратор' : rank;
const REVIEW_RANKS = ['Вице-Губернатор', 'Депутат', 'Адвокат', 'Лицензер'] as const;
const INACTIVITY_REVIEW_TABS = [
  { status: 'pending_review', label: 'На проверке' },
  { status: 'approved', label: 'Одобренные' },
  { status: 'rejected', label: 'Отказанные' },
  { status: 'cancelled', label: 'Аннулированные' },
] as const;
const STANDARD_REVIEW_TABS = [
  { status: 'pending_review', label: 'Ожидают проверки' },
  { status: 'approved', label: 'Одобренные' },
  { status: 'rejected', label: 'Отказанные' },
] as const;
type StandardReviewStatus = (typeof STANDARD_REVIEW_TABS)[number]['status'];

function ReviewFilters({ nickname, rank, onNicknameChange, onRankChange, rankDisabled = false, rankHint }: {
  nickname: string;
  rank: string;
  onNicknameChange: (value: string) => void;
  onRankChange: (value: string) => void;
  rankDisabled?: boolean;
  rankHint?: string;
}) {
  return <div className="review-filters" aria-label="Фильтры отчётов">
    <label className="field-inline-label">ПО НИКУ
      <input type="search" value={nickname} onChange={(event) => onNicknameChange(event.target.value)} placeholder="Введите ник сотрудника" />
    </label>
    <label className="field-inline-label">ПО ЗВАНИЮ
      <select value={rank} onChange={(event) => onRankChange(event.target.value)} disabled={rankDisabled}>
        <option value="">Все звания</option>
        {REVIEW_RANKS.map((rankOption) => <option key={rankOption} value={rankOption}>{rankOption}</option>)}
      </select>
    </label>
    {rankHint && <span className="review-filter-hint" role="status">{rankHint}</span>}
  </div>;
}

function matchesReviewFilters(nickname: string, memberId: string | null, membersById: ReadonlyMap<string, Member>, nicknameFilter: string, rankFilter: string) {
  const normalizedFilter = nicknameFilter.trim().toLocaleLowerCase('ru-RU');
  if (normalizedFilter && !nickname.toLocaleLowerCase('ru-RU').includes(normalizedFilter)) return false;
  if (!rankFilter) return true;
  const member = memberId ? membersById.get(memberId) : undefined;
  return !!member && memberTitle(member.role, member.rank) === rankFilter;
}
const LABEL: Record<string, string> = {
  active: 'Активен', blocked: 'Заблокирован', removed: 'Исключён', planned: 'Запланировано', completed: 'Завершено',
  cancelled: 'Аннулировано', assigned: 'Назначено', in_progress: 'В работе', pending_review: 'На проверке',
  approved: 'Принято', rejected: 'Отклонено', revision_required: 'Нужна доработка',
  not_submitted: 'Не сдано', overdue: 'Срок истёк', low: 'Низкий', normal: 'Обычный',
  high: 'Высокий', urgent: 'Срочный', standard_assigned: 'Назначен норматив',
  revoked: 'Снято', converted: 'Конвертировано',
  standard_submitted: 'Норматив отправлен', standard_reviewed: 'Результат норматива',
  standard_auto_closed: 'Норматив закрыт на проверку',
  task_assigned: 'Новое поручение', task_submitted: 'Поручение отправлено',
  task_reviewed: 'Результат поручения', task_cancelled: 'Поручение отменено',
};
const dateText = (value?: string | null, time = false, timeZone?: string) => value
  ? new Intl.DateTimeFormat('ru-RU', { ...(time ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'long', year: 'numeric' }), ...(timeZone ? { timeZone } : {}) }).format(new Date(value))
  : 'Без срока';
const initials = (name = '') => name.split(/[\s_-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
const invalidate = (qc: ReturnType<typeof useQueryClient>, ...keys: (readonly unknown[])[]) => keys.forEach((queryKey) => void qc.invalidateQueries({ queryKey }));
const mutationErrorText = (error: unknown, fallback: string) => {
  const data = (error as { data?: unknown } | null)?.data;
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' && data.error.trim()) return data.error;
  return fallback;
};
const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];
const maxImageSize = 25 * 1024 * 1024;
const maxStandardScreenshots = 15;

function App() {
  return <QueryClientProvider client={queryClient}><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter></QueryClientProvider>;
}

function Router() {
  const { data: user, isLoading, isError, refetch } = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), retry: false, refetchOnMount: 'always' } });
  const [path, setPath] = useLocation();
  useEffect(() => { if (!isLoading && (isError || !user) && path !== '/login') setPath('/login'); if (user && !user.mustChangePassword && path === '/login') setPath('/dashboard'); }, [isLoading, isError, user, path, setPath]);
  if (isLoading) return <FullLoading />;
  if (isError || !user) return <LoginScreen onAuthenticated={() => { void refetch(); setPath('/dashboard'); }} />;
  if (user.mustChangePassword) return <ForcedPasswordChange user={user} />;
  return <Shell user={user}><Switch>
    <Route path="/login"><HomeRedirect /></Route>
    <Route path="/"><HomeRedirect /></Route>
    <Route path="/dashboard"><DashboardPage user={user} /></Route>
    <Route path="/members">{user.role !== 'employee' ? <MembersPage user={user} /> : <AccessDenied />}</Route>
    <Route path="/events">{user.role !== 'employee' ? <EventsPage user={user} /> : <EmployeeEventsPage />}</Route>
    <Route path="/inactivity"><InactivityPage user={user} /></Route>
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

function ForcedPasswordChange({ user }: { user: SessionUser }) {
  const change = useChangePassword();
  const [error, setError] = useState('');
  const [visible, setVisible] = useState({ current: false, next: false, confirm: false });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get('currentPassword'));
    const newPassword = String(form.get('newPassword'));
    if (newPassword !== String(form.get('confirmPassword'))) {
      setError('Новые пароли не совпадают. Проверьте оба поля.');
      return;
    }
    if (newPassword.length < 10) {
      setError('Новый пароль должен содержать не менее 10 символов.');
      return;
    }
    change.mutate(
      { data: { currentPassword, newPassword } },
      {
        onSuccess: () => window.location.reload(),
        onError: (issue) => setError(mutationErrorText(issue, 'Не удалось сменить пароль. Проверьте временный пароль и попробуйте ещё раз.')),
      },
    );
  };
  return <main className="password-reset-page">
    <div className="auth-grid" aria-hidden="true" />
    <section className="password-reset-card" role="dialog" aria-modal="true" aria-labelledby="password-reset-title">
      <BrandLockup />
      <div className="password-reset-status"><KeyRound size={16} /><span>ОБЯЗАТЕЛЬНЫЙ ШАГ · ПЕРВЫЙ ВХОД</span></div>
      <h1 id="password-reset-title">Смените временный пароль</h1>
      <p className="password-reset-lead">Здравствуйте, <strong>{user.nickname}</strong>. Руководитель выдал вам временный пароль. Придумайте личный пароль, чтобы продолжить работу.</p>
      <div className="password-reset-instructions">
        <div className="password-reset-instruction-icon"><CircleAlert size={20} /></div>
        <p>Введите выданный пароль, затем новый пароль длиной не менее <strong>10 символов</strong>. После сохранения страница обновится автоматически.</p>
      </div>
      <form className="password-reset-form" onSubmit={submit}>
        <Field label="ВРЕМЕННЫЙ ПАРОЛЬ">
          <span className="password-reset-input"><input name="currentPassword" type={visible.current ? 'text' : 'password'} autoComplete="current-password" autoFocus required /><button type="button" className="icon-button" aria-label={visible.current ? 'Скрыть временный пароль' : 'Показать временный пароль'} onClick={() => setVisible((state) => ({ ...state, current: !state.current }))}>{visible.current ? <EyeOff size={18} /> : <Eye size={18} />}</button></span>
        </Field>
        <Field label="НОВЫЙ ЛИЧНЫЙ ПАРОЛЬ">
          <span className="password-reset-input"><input name="newPassword" type={visible.next ? 'text' : 'password'} minLength={10} maxLength={128} autoComplete="new-password" required /><button type="button" className="icon-button" aria-label={visible.next ? 'Скрыть новый пароль' : 'Показать новый пароль'} onClick={() => setVisible((state) => ({ ...state, next: !state.next }))}>{visible.next ? <EyeOff size={18} /> : <Eye size={18} />}</button></span>
        </Field>
        <Field label="ПОВТОРИТЕ НОВЫЙ ПАРОЛЬ">
          <span className="password-reset-input"><input name="confirmPassword" type={visible.confirm ? 'text' : 'password'} minLength={10} maxLength={128} autoComplete="new-password" required /><button type="button" className="icon-button" aria-label={visible.confirm ? 'Скрыть подтверждение пароля' : 'Показать подтверждение пароля'} onClick={() => setVisible((state) => ({ ...state, confirm: !state.confirm }))}>{visible.confirm ? <EyeOff size={18} /> : <Eye size={18} />}</button></span>
        </Field>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="button button-primary password-reset-submit" disabled={change.isPending}>
          {change.isPending ? <><LoaderCircle className="spin" size={18} /> Сохраняем новый пароль…</> : <>Сохранить пароль и продолжить <ArrowUpRight size={18} /></>}
        </button>
      </form>
      <div className="password-reset-footnote"><Shield size={14} /><span>Доступ к системе откроется сразу после смены пароля.</span></div>
    </section>
  </main>;
}

function Shell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const [path] = useLocation(); const [mobileOpen, setMobileOpen] = useState(false); const qc = useQueryClient();
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 60000 } });
  const { data: notifications } = useListNotifications({ query: { queryKey: getListNotificationsQueryKey(), refetchInterval: 60000 } });
  const employeeEvents = useListEvents({ query: { queryKey: getListEventsQueryKey(), enabled: user.role === 'employee', refetchInterval: 30000 } });
  const logout = useLogout(); const navItems = user.role === 'employee' ? NAV_ITEMS.filter((item) => !item.staff || (item.href === '/events' && !!employeeEvents.data?.length)) : NAV_ITEMS;
  const doLogout = () => logout.mutate(undefined, { onSuccess: () => { qc.removeQueries({ queryKey: getGetCurrentUserQueryKey() }); window.location.assign(import.meta.env.BASE_URL || '/'); } });
  return <div className="app-shell"><aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
    <div className="sidebar-brand"><BrandLockup /><button className="icon-button mobile-close" aria-label="Закрыть меню" onClick={() => setMobileOpen(false)}><X size={18} /></button></div>
    <div className="sidebar-section-label">РАБОЧАЯ ЗОНА</div><nav className="side-nav" aria-label="Основная навигация">
      {navItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-link ${path === href ? 'active' : ''}`} onClick={() => setMobileOpen(false)} data-testid={`link-nav-${href.slice(1)}`}><Icon size={17} /><span>{label}</span>{href === '/notifications' && !!notifications?.filter((n) => !n.readAt).length && <b className="nav-count">{notifications.filter((n) => !n.readAt).length}</b>}{path === href && <i className="nav-active-mark" />}</Link>)}
    </nav><div className="sidebar-bottom"><div className="server-status"><span className={`status-pulse ${health.isError ? 'health-down' : ''}`} /><div><strong>{health.isLoading ? 'ПРОВЕРКА СВЯЗИ' : health.isError ? 'СЕРВЕР НЕДОСТУПЕН' : 'СЕРВЕР НА СВЯЗИ'}</strong><small>{health.isError ? 'Соединение нестабильно' : 'API отвечает штатно'}</small></div><Activity size={15} /></div>
      <div className="profile-strip"><div className="avatar">{initials(user.nickname)}</div><div className="profile-copy"><strong>{user.nickname}</strong><span>{memberTitle(user.role, user.rank)}</span></div><button className="icon-button logout-button" aria-label="Выйти из аккаунта" onClick={doLogout}><LogOut size={16} /></button></div>
    </div></aside>
    {mobileOpen && <button aria-label="Закрыть меню" className="mobile-scrim" onClick={() => setMobileOpen(false)} />}
     <div className="workspace"><header className="topbar"><button className="icon-button mobile-menu" aria-label="Открыть меню" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><div className="breadcrumb"><span>ПАНЕЛЬ</span><span className="crumb-slash">/</span><strong>{NAV_ITEMS.find((item) => item.href === path)?.label ?? 'Обзор'}</strong></div><div className="topbar-right"><div className="topbar-clock"><span className="status-pulse" /> СЕССИЯ АКТИВНА</div><div className="topbar-date">{dateText(new Date().toISOString())}</div><div className="avatar avatar-small">{initials(user.nickname)}</div></div></header>
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
function Modal({ title, subtitle, children, onClose, className = '', closeDisabled = false }: { title: string; subtitle: string; children: ReactNode; onClose: () => void; className?: string; closeDisabled?: boolean }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (!closeDisabled && e.target === e.currentTarget) onClose(); }}><section className={`modal-card ${className}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><span className="eyebrow"><span /> СЛУЖЕБНАЯ ФОРМА</span><h2 id="modal-title">{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={onClose} aria-label="Закрыть окно" disabled={closeDisabled}><X size={18} /></button></div>{children}</section></div>;
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
  return <><PageHeading eyebrow={`СМЕНА / ${memberTitle(user.role, user.rank).toUpperCase()}`} title={`Добрый день, ${user.nickname}.`} description="Сводка по сотрудникам, поручениям и нормативам Правительства области." action={<div className="date-stamp"><span>ТЕКУЩАЯ ДАТА</span><strong>{dateText(new Date().toISOString())}</strong></div>} />
    <DashboardDisciplineRoster user={user} />
    <div className="stats-grid"><StatCard label="СОСТАВ" value={data.memberCount} note={`${data.activeMembers} активны`} icon={Users} /><StatCard label="ОТКРЫТЫЕ ПОРУЧЕНИЯ" value={data.openTasks} note="В работе у команды" icon={ListChecks} accent /><StatCard label="НОРМАТИВЫ НА ПРОВЕРКЕ" value={data.pendingStandards} note={`${data.pendingTaskReviews} поручений ожидают оценки`} icon={BookOpen} /></div>
    <div className="dashboard-columns"><Panel title="Ближайшие события" meta={`${data.recentEvents.length} В ЛЕНТЕ`}>{data.recentEvents.length ? <div className="activity-list">{data.recentEvents.map((ev) => <div className="activity-row" key={ev.id}><div className="activity-date"><strong>{new Date(ev.startsAt).getDate()}</strong><span>{new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(new Date(ev.startsAt)).toUpperCase()}</span></div><div className="activity-info"><strong>{ev.title}</strong><span><Clock3 size={12} />{dateText(ev.startsAt, true)}{ev.endsAt ? ` · до ${dateText(ev.endsAt, true)}` : ''}</span></div><Badge status={ev.status} /></div>)}</div> : <EmptyState title="Событий пока нет" text="Назначенные мероприятия появятся здесь." />}{(user.role !== 'employee' || data.recentEvents.length > 0) && <Link href="/events" className="panel-link">Все мероприятия <ArrowUpRight size={15} /></Link>}</Panel>
      <Panel title="На контроле" meta={`${data.recentTasks.length} ПОРУЧЕНИЙ`}>{data.recentTasks.length ? <div className="task-feed">{data.recentTasks.map((task) => <div className="task-feed-row" key={task.id}><div className={`priority-line priority-${task.priority}`} /><div className="task-feed-copy"><strong>{task.title}</strong><span>{task.assigneeNickname} · {LABEL[task.status]}</span></div><span className="task-feed-date">{dateText(task.dueAt)}</span></div>)}</div> : <EmptyState title="Поручений пока нет" text="Новые задачи появятся в этой ленте." />}<Link href="/tasks" className="panel-link">Открыть поручения <ArrowUpRight size={15} /></Link></Panel></div>
    <div className="dashboard-footnote"><span className="mono">ДАННЫЕ СИСТЕМЫ</span><span><span className="status-pulse" /> СИНХРОНИЗИРОВАНО</span></div>
  </>;
}

function DashboardDisciplineRoster({ user }: { user: SessionUser }) {
  const manager = user.role !== 'employee';
  const records = useDisciplineRecords();
  const members = useListMembers({
    query: { queryKey: getListMembersQueryKey(), refetchInterval: 60000 },
  });
  const points = usePoints();
  const inactivity = useInactivityRequests();
  const [pointAdjustment, setPointAdjustment] = useState<{ member: Member; mode: 'award' | 'deduct' } | null>(null);
  const today = moscowDateKey();
  const employees = useMemo(
    () => (members.data ?? []).filter((member) => member.role === 'employee'),
    [members.data],
  );
  const pointsByMember = useMemo(
    () => new Map((points.data ?? []).map((balance) => [balance.memberId, balance.points])),
    [points.data],
  );
  const summaries = useMemo(() => {
    const approvedPeriods = (inactivity.data ?? [])
      .filter((request) => request.status === 'approved' && request.endDate >= today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    const inactivityByMember = new Map<string, InactivityRequest>();
    for (const request of approvedPeriods) {
      const current = inactivityByMember.get(request.memberId);
      if (!current || (request.startDate <= today && current.startDate > today)) {
        inactivityByMember.set(request.memberId, request);
      }
    }
    return employees.map((member) => {
      const history = (records.data ?? []).filter((record) => record.memberId === member.id);
      return {
        member,
        warnings: history.filter((record) => record.type === 'warning' && record.status === 'active').length,
        reprimands: history.filter((record) => record.type === 'reprimand' && record.status === 'active').length,
        points: pointsByMember.get(member.id) ?? 0,
        inactivePeriod: inactivityByMember.get(member.id) ?? null,
      };
    });
  }, [employees, records.data, pointsByMember, inactivity.data, today]);

  return <>
    <section className="dashboard-discipline-card" aria-labelledby="dashboard-discipline-title">
      <div className="dashboard-discipline-header">
        <div>
          <div className="dashboard-discipline-kicker"><span className="status-pulse" /> АКТИВНЫЕ ВЗЫСКАНИЯ</div>
          <h2 id="dashboard-discipline-title">{manager ? 'Взыскания сотрудников' : 'Мои взыскания'}</h2>
        </div>
        {manager && <Link href="/discipline" className="dashboard-discipline-link">Открыть реестр <ArrowUpRight size={15} /></Link>}
      </div>
      {records.isLoading || members.isLoading || points.isLoading || inactivity.isLoading ? <div className="dashboard-discipline-message" role="status">Загружаем дисциплинарную сводку…</div> :
        records.isError || members.isError || points.isError || inactivity.isError ? <InlineError message="Не удалось загрузить дисциплинарную сводку." onRetry={() => { void records.refetch(); void members.refetch(); void points.refetch(); void inactivity.refetch(); }} /> :
          !summaries.length ? <div className="dashboard-discipline-message">{manager ? 'Сотрудников пока нет.' : 'Профиль сотрудника не найден.'}</div> :
            <div className="dashboard-discipline-table" role="table" aria-label={manager ? 'Активные взыскания и баллы по сотрудникам' : 'Мои активные взыскания и баллы'}>
              <div className="dashboard-discipline-columns" role="row">
                <span role="columnheader">СОТРУДНИК / НЕАКТИВ</span>
                <span role="columnheader">ПРЕДУПР.</span>
                <span role="columnheader">ВЫГОВОРЫ</span>
                <span role="columnheader">БАЛЛЫ</span>
              </div>
              {summaries.map((summary) => <div className="dashboard-discipline-row" role="row" key={summary.member.id}>
                <div className="dashboard-discipline-person" role="cell">
                  <strong>{summary.member.nickname}</strong>
                  <span>{summary.member.rank}</span>
                  {summary.inactivePeriod && <span className="dashboard-inactivity-period">Неактив с {formatInactivityDate(summary.inactivePeriod.startDate)} по {formatInactivityDate(summary.inactivePeriod.endDate)}</span>}
                </div>
                <span className="dashboard-discipline-count dashboard-discipline-warning" role="cell" aria-label={'Активных предупреждений: ' + summary.warnings}>{summary.warnings}<small> / 2</small></span>
                <span className="dashboard-discipline-count dashboard-discipline-reprimand" role="cell" aria-label={'Активных выговоров: ' + summary.reprimands}>{summary.reprimands}<small> / 3</small></span>
                <div className="dashboard-point-cell" role="cell">
                  <strong className="dashboard-point-value">{summary.points > 0 ? '+' + summary.points : summary.points}</strong>
                  {manager && <div className="dashboard-point-actions"><button className="dashboard-point-award" type="button" aria-label={'Начислить баллы: ' + summary.member.nickname} title="Начислить баллы" onClick={() => setPointAdjustment({ member: summary.member, mode: 'award' })}>+</button><button className="dashboard-point-deduct" type="button" aria-label={'Списать баллы: ' + summary.member.nickname} title="Списать баллы" onClick={() => setPointAdjustment({ member: summary.member, mode: 'deduct' })}>−</button></div>}
                </div>
              </div>)}
            </div>}
    </section>
    <PointsAdjustmentModal member={pointAdjustment?.member ?? null} mode={pointAdjustment?.mode ?? 'deduct'} currentPoints={pointAdjustment ? pointsByMember.get(pointAdjustment.member.id) ?? 0 : undefined} onClose={() => setPointAdjustment(null)} />
  </>;
}
function StatCard({ label, value, note, icon: Icon, accent = false }: { label: string; value: string | number; note: string; icon: typeof Users; accent?: boolean }) { return <div className={`stat-card ${accent ? 'stat-accent' : ''}`}><div className="stat-top"><span>{label}</span><Icon size={17} /></div><div className="stat-number">{value}</div><div className="stat-note"><span className="stat-marker" />{note}</div></div>; }

function StandardsPage({ user }: { user: SessionUser }) {
  const qc = useQueryClient(); const manager = user.role !== 'employee';
  const templates = useListStandards({ query: { queryKey: getListStandardsQueryKey(), enabled: manager, refetchOnMount: 'always' } });
  const assignments = useListStandardAssignments({ query: { queryKey: getListStandardAssignmentsQueryKey(), refetchOnMount: 'always', refetchInterval: 15000 } });
  const members = useListMembers({ query: { queryKey: getListMembersQueryKey(), enabled: manager } });
  const createStandard = useCreateStandard(); const updateStandard = useUpdateStandard(); const deleteStandard = useDeleteStandard();
  const [editing, setEditing] = useState<Standard | null>(null); const [templateOpen, setTemplateOpen] = useState(false);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [submitTarget, setSubmitTarget] = useState<StandardAssignment | null>(null);
  const [reviewNickname, setReviewNickname] = useState('');
  const [reviewRank, setReviewRank] = useState('');
  const [reviewStatus, setReviewStatus] = useState<StandardReviewStatus>('pending_review');
  const [templateError, setTemplateError] = useState('');
  const [deleteNotice, setDeleteNotice] = useState('');
  const membersById = useMemo(() => new Map((members.data ?? []).map((member) => [member.id, member])), [members.data]);
  const visibleAssignments = useMemo(() => (assignments.data ?? []).filter((assignment) =>
    !manager || matchesReviewFilters(assignment.assigneeNickname, assignment.assigneeId, membersById, reviewNickname, reviewRank),
  ), [assignments.data, manager, membersById, reviewNickname, reviewRank]);
  const reviewAssignments = manager ? visibleAssignments.filter((assignment) => assignment.status === reviewStatus) : visibleAssignments;
  const otherAssignments = manager ? visibleAssignments.filter((assignment) => !STANDARD_REVIEW_TABS.some((tab) => tab.status === assignment.status)) : [];
  const reviewCount = (status: StandardReviewStatus) => visibleAssignments.filter((assignment) => assignment.status === status).length;
  const saveTemplate = (payload: { title: string; description: string; requirements: string; category: string; target: number; unit: string; dailyRank: string | null }) => {
    const done = () => { invalidate(qc, getListStandardsQueryKey()); invalidate(qc, getListStandardAssignmentsQueryKey()); setTemplateOpen(false); setEditing(null); };
    setTemplateError('');
    if (editing) updateStandard.mutate({ id: editing.id, data: payload }, { onSuccess: done, onError: (error) => setTemplateError(mutationErrorText(error, 'Не удалось изменить норматив.')) });
    else createStandard.mutate({ data: payload }, { onSuccess: done, onError: (error) => setTemplateError(mutationErrorText(error, 'Не удалось создать норматив.')) });
  };
  const anyLoading = assignments.isLoading || (manager && templates.isLoading);
  if (anyLoading) return <PageSkeleton />;
  if (assignments.isError || (manager && templates.isError)) return <InlineError message="Не удалось загрузить нормативы." onRetry={() => { void assignments.refetch(); void templates.refetch(); }} />;
  return <><PageHeading eyebrow="СТАНДАРТЫ / ИСПОЛНЕНИЕ" title="Нормативы" description={manager ? 'Ежедневные нормативы по званиям и проверка результатов.' : 'Ваши назначенные нормативы и история подтверждений.'} action={manager && <button className="button button-primary" onClick={() => { setEditing(null); setTemplateError(''); setTemplateOpen(true); }}><Plus size={16} /> Новый норматив</button>} />
    {deleteNotice && <div className="form-success" role="status">{deleteNotice}</div>}
    {manager && <section className="template-zone"><div className="section-kicker"><span /> НОРМАТИВЫ <span className="section-rule" /></div>{!templates.data?.length ? <div className="empty-slim">Нормативов пока нет. Создайте норматив и укажите звание для ежедневного назначения.</div> : <div className="template-grid">{templates.data.map((s) => <article className="template-card" key={s.id}><div className="template-top"><span>{s.category}</span><div className="template-controls">{s.dailyRank && <span className="daily-badge">ЕЖЕДНЕВНО · {s.dailyRank}</span>}<button className="icon-button" title={`Изменить ${s.title}`} aria-label={`Изменить ${s.title}`} onClick={() => { setEditing(s); setTemplateError(''); setTemplateOpen(true); }}><Pencil size={14} /></button><button className="icon-button danger-icon" aria-label={`Удалить ${s.title}`} onClick={() => { if (confirm(`Удалить шаблон «${s.title}»? История уже назначенных нормативов останется сохранённой.`)) deleteStandard.mutate({ id: s.id }, { onSuccess: () => { invalidate(qc, getListStandardsQueryKey()); setDeleteNotice('Норматив удалён. История ранее назначенных заданий остаётся сохранённой.'); }, onError: (error) => alert(mutationErrorText(error, 'Не удалось удалить норматив.')) }); }}><Trash2 size={14} /></button></div></div><h3>{s.title}</h3><p>{s.description || s.requirements}</p><div className="template-target"><strong>{s.target}</strong><span>{s.unit}</span></div></article>)}</div>}</section>}
    <div className="section-kicker assignments-kicker"><span /> {manager ? 'НАЗНАЧЕННАЯ РАБОТА' : 'МОИ НОРМАТИВЫ'} <span className="section-rule" /><span className="section-count">{manager ? reviewCount(reviewStatus) : visibleAssignments.length}</span></div>
    {manager ? <>
      <div className="filter-tabs standard-review-tabs" aria-label="Статус нормативов">
        {STANDARD_REVIEW_TABS.map((tab) => <button type="button" key={tab.status} aria-pressed={reviewStatus === tab.status} className={reviewStatus === tab.status ? 'selected' : ''} onClick={() => setReviewStatus(tab.status)}>{tab.label}<span className="standard-review-count">{reviewCount(tab.status)}</span></button>)}
      </div>
      <ReviewFilters nickname={reviewNickname} rank={reviewRank} onNicknameChange={setReviewNickname} onRankChange={setReviewRank} rankDisabled={members.isLoading || members.isError} rankHint={members.isLoading ? 'Загружаем список званий…' : members.isError ? 'Фильтр по званию временно недоступен.' : undefined} />
      {!reviewAssignments.length ? <EmptyState title={assignments.data?.some((assignment) => assignment.status === reviewStatus) ? 'По фильтрам нормативов нет' : 'Нормативов в этой вкладке нет'} text={assignments.data?.some((assignment) => assignment.status === reviewStatus) ? 'Измените ник или звание, чтобы увидеть другие нормативы.' : 'Нормативы с таким статусом появятся здесь.'} /> : <div className="assignments-list">{reviewAssignments.map((a) => <AssignmentCard key={a.id} assignment={a} manager onSubmit={() => setSubmitTarget(a)} onHistory={() => setHistoryId(historyId === a.id ? null : a.id)} onReview={() => setHistoryId(a.id)} />)}</div>}
      {!!otherAssignments.length && <section className="standards-other-assignments" aria-label="Другие назначения"><div className="section-kicker"><span /> ДРУГИЕ НАЗНАЧЕНИЯ <span className="section-rule" /><span className="section-count">{otherAssignments.length}</span></div><div className="assignments-list">{otherAssignments.map((a) => <AssignmentCard key={a.id} assignment={a} manager onSubmit={() => setSubmitTarget(a)} onHistory={() => setHistoryId(historyId === a.id ? null : a.id)} onReview={() => setHistoryId(a.id)} />)}</div></section>}
    </> : !visibleAssignments.length ? <EmptyState title="Назначенных нормативов нет" text="Назначенные нормативы появятся здесь." /> : <div className="assignments-list">{visibleAssignments.map((a) => <AssignmentCard key={a.id} assignment={a} manager={manager} onSubmit={() => setSubmitTarget(a)} onHistory={() => setHistoryId(historyId === a.id ? null : a.id)} onReview={() => setHistoryId(a.id)} />)}</div>}
    {templateOpen && <Modal title={editing ? 'Изменить норматив' : 'Новый норматив'} subtitle="Ежедневное назначение можно связать с одним конкретным званием." onClose={() => { setTemplateOpen(false); setEditing(null); }}><StandardTemplateForm initial={editing} pending={createStandard.isPending || updateStandard.isPending} error={templateError} onCancel={() => { setTemplateOpen(false); setEditing(null); }} onSubmit={saveTemplate} /></Modal>}
    {submitTarget && <SubmitModal title="Отправить результат" detail={submitTarget.title} onClose={() => setSubmitTarget(null)} pendingHook="standard" id={submitTarget.id} onSubmitted={() => { invalidate(qc, getListStandardAssignmentsQueryKey()); setSubmitTarget(null); }} />}
    {historyId && <Modal title="Отправки и проверка" subtitle="История отправок, комментарии и решения руководства." onClose={() => setHistoryId(null)} className="history-modal"><StandardAssignmentHistory id={historyId} manager={manager} onClose={() => setHistoryId(null)} onReviewed={() => invalidate(qc, getListStandardAssignmentsQueryKey())} /></Modal>}
  </>;
}

function AssignmentCard({ assignment: a, manager, onSubmit, onHistory, onReview }: { assignment: StandardAssignment; manager: boolean; onSubmit: () => void; onHistory: () => void; onReview: () => void }) {
   return <article className={`assignment-card status-edge-${a.status}`} data-testid={`card-standard-${a.id}`}><div className="assignment-stamp"><BookOpen size={17} /><span>{a.category}</span></div><div className="assignment-copy"><div className="assignment-title-line"><h2>{a.title}</h2><Badge status={a.status} /></div><p>{a.description || 'Описание не добавлено.'}</p>{a.requirements && <div className="standard-requirements"><span>ТРЕБОВАНИЯ</span><p>{a.requirements}</p></div>}<div className="assignment-facts"><span><Users size={13} />{manager ? a.assigneeNickname : `Назначил ${a.assignedByNickname}`}</span><span><Clock3 size={13} />Срок: {a.autoGenerated ? `${dateText(a.dueAt, true, 'Europe/Moscow')} МСК` : dateText(a.dueAt)}</span><span>{a.autoGenerated ? 'Цикл обновляется в 00:00 МСК' : `${a.target} ${a.unit}`}</span></div>{a.latestReviewReason && <div className="review-note"><strong>Комментарий руководства</strong><span>{a.latestReviewReason}</span></div>}{a.latestComment && <div className="last-comment">Комментарий отправки: {a.latestComment}</div>}</div><div className="assignment-actions">{a.status !== 'cancelled' && <button className="button button-secondary button-small" onClick={onHistory}><History size={14} /> История</button>}{a.status !== 'cancelled' && (manager ? <button className="button button-primary button-small" onClick={onReview} disabled={a.status !== 'pending_review'}><FileCheck2 size={14} /> Проверить</button> : ['not_submitted', 'overdue'].includes(a.status) && <button className="button button-primary button-small" onClick={onSubmit}><Camera size={14} /> {a.versionCount ? 'Пересдать' : 'Отправить'}</button>)}</div></article>;
}

function StandardTemplateForm({ initial, pending, error, onCancel, onSubmit }: { initial: Standard | null; pending: boolean; error: string; onCancel: () => void; onSubmit: (v: { title: string; description: string; requirements: string; category: string; target: number; unit: string; dailyRank: string | null }) => void }) {
  const [title, setTitle] = useState(initial?.title ?? ''); const [description, setDescription] = useState(initial?.description ?? ''); const [requirements, setRequirements] = useState(initial?.requirements ?? ''); const [category, setCategory] = useState(initial?.category ?? 'Служба'); const [target, setTarget] = useState(String(initial?.target ?? 1)); const [unit, setUnit] = useState(initial?.unit ?? '');
  const [dailyRank, setDailyRank] = useState(initial?.dailyRank ?? '');
   return <form className="dialog-form" onSubmit={(e) => { e.preventDefault(); onSubmit({ title, description, requirements, category, target: Number(target), unit, dailyRank: dailyRank || null }); }}><Field label="Название"><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required /></Field><div className="form-split"><Field label="Категория"><input value={category} onChange={(e) => setCategory(e.target.value)} maxLength={80} required /></Field><Field label="Цель"><input type="number" min="1" value={target} onChange={(e) => setTarget(e.target.value)} required /></Field></div><Field label="Единица измерения"><input value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={40} placeholder="раз в день" required /></Field><Field label="Описание"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={4000} /></Field><Field label="Требования к выполнению"><textarea value={requirements} onChange={(e) => setRequirements(e.target.value)} rows={4} maxLength={6000} required /></Field><Field label="Ежедневное назначение по званию"><select value={dailyRank} onChange={(e) => setDailyRank(e.target.value)}><option value="">Не назначать ежедневно</option>{['Администратор', 'Лидер', 'Вице-Губернатор', 'Депутат', 'Адвокат', 'Лицензер'].map((rankOption) => <option key={rankOption} value={rankOption}>{rankOption}</option>)}</select></Field><p className="form-hint">После сохранения норматив сразу появится у активных сотрудников выбранного звания. В 00:00 МСК истёкший норматив отправится на проверку, а новый цикл назначится автоматически.</p>{error && <div className="form-error" role="alert">{error}</div>}<FormActions pending={pending} onCancel={onCancel} label={initial ? 'Сохранить норматив' : 'Создать норматив'} /></form>;
}
function StandardAssignmentHistory({ id, manager, onClose, onReviewed }: { id: string; manager: boolean; onClose: () => void; onReviewed: () => void }) {
  const query = useListStandardSubmissions(id, { query: { queryKey: getListStandardSubmissionsQueryKey(id), refetchOnMount: 'always' } });
  const review = useReviewStandardSubmission(); const [decision, setDecision] = useState<'approved' | 'rejected'>('approved'); const [reason, setReason] = useState('');
  if (query.isLoading) return <PageSkeleton />;
  if (query.isError) return <InlineError message="История нормативов недоступна." onRetry={() => void query.refetch()} />;
  const pending = query.data?.find((s) => s.status === 'pending_review' && s.files.length > 0);
  const automaticallyMissed = query.data?.some((s) => s.status === 'pending_review' && s.files.length === 0);
  const submitReview = () => { if (!pending || reason.trim().length < 1) return; review.mutate({ id: pending.id, data: { status: decision, reason: reason.trim() } }, { onSuccess: () => { void query.refetch(); onReviewed(); setReason(''); }, onError: () => alert('Не удалось сохранить решение.') }); };
  return <div className="submission-history">{!query.data?.length ? <EmptyState title="Отправок ещё нет" text="Когда сотрудник прикрепит подтверждение, история появится здесь." /> : query.data.map((item) => <SubmissionEntry key={item.id} item={item} />)}
    {manager && automaticallyMissed && <div className="review-note"><strong>Норматив не сдан в срок</strong><span>Баллы за пропуск уже списаны. Отчёт без подтверждения нельзя одобрить.</span></div>}
    {manager && pending && <div className="review-box"><div className="section-kicker"><span /> РЕШЕНИЕ ПО ОТЧЁТУ</div><Field label="Решение"><select value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)}><option value="approved">Принять</option><option value="rejected">Отклонить</option></select></Field><Field label="Обязательная причина / комментарий"><textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} rows={3} required placeholder="Объясните решение сотруднику" /></Field><div className="dialog-actions"><button className="button button-secondary" onClick={onClose}>Закрыть</button><button className="button button-primary" disabled={review.isPending || !reason.trim()} onClick={submitReview}>{review.isPending ? 'Сохраняем…' : 'Зафиксировать решение'} <Check size={15} /></button></div></div>}
  </div>;
}
function SubmissionEntry({ item }: { item: StandardSubmission | TaskSubmission }) {
  return <article className="submission-entry"><div className="submission-heading"><div><strong>Отправлено</strong><span>{dateText(item.submittedAt, true)}</span></div><Badge status={item.status} /></div>{item.comment && <p className="submission-comment">{item.comment}</p>}{item.decisionReason && <div className="review-note"><strong>{item.reviewerNickname ? `Решение · ${item.reviewerNickname}` : 'Комментарий руководства'}</strong><span>{item.decisionReason}</span></div>}<FileGallery files={item.files} /></article>;
}
function FileGallery({ files }: { files: SubmissionFile[] }) {
  return <div className="evidence-gallery">{files.map((file) => <a key={file.id} className="evidence-thumb" href={`/api/storage${file.objectPath}`} target="_blank" rel="noreferrer"><img src={`/api/storage${file.objectPath}`} alt={file.originalName} /><span><FileImage size={12} />{file.originalName}</span></a>)}</div>;
}

function SubmitModal({ title, detail, onClose, onSubmitted, id, pendingHook }: { title: string; detail: string; onClose: () => void; onSubmitted: () => void; id: string; pendingHook: 'standard' | 'task' | 'event' }) {
  const qc = useQueryClient(); const upload = useRequestUploadUrl(); const standardSubmit = useSubmitStandard(); const taskSubmit = useSubmitTask(); const eventSubmit = useSubmitEventSubmission();
  const submitLock = useRef(false);
  const [files, setFiles] = useState<File[]>([]); const [comment, setComment] = useState(''); const [error, setError] = useState(''); const busy = upload.isPending || standardSubmit.isPending || taskSubmit.isPending || eventSubmit.isPending;
  const [sendPhase, setSendPhase] = useState<'idle' | 'uploading' | 'submitting'>('idle'); const [uploadedCount, setUploadedCount] = useState(0);
  const isBusy = busy || eventSubmit.isPending || sendPhase !== 'idle';
  const maxFiles = pendingHook === 'standard' ? maxStandardScreenshots : 50;
  const previews = useMemo(() => files.map((file) => ({ file, url: URL.createObjectURL(file) })), [files]);
  useEffect(() => () => previews.forEach(({ url }) => URL.revokeObjectURL(url)), [previews]);
  const addFiles = (list: FileList | null) => {
    if (!list) return; const next = Array.from(list); const valid: File[] = []; let issue = '';
    for (const f of next) { if (files.length + valid.length >= maxFiles) { issue = pendingHook === 'standard' ? `Для норматива можно прикрепить не более ${maxFiles} скриншотов.` : `Можно прикрепить не более ${maxFiles} скриншотов.`; break; } if (!imageTypes.includes(f.type)) issue = `${f.name}: используйте JPG, PNG или WebP.`; else if (f.size > maxImageSize) issue = `${f.name}: размер больше 25 МБ.`; else valid.push(f); }
    if (issue) setError(issue); else setError(''); setFiles((current) => [...current, ...valid]);
  };
  const send = async (e: FormEvent) => {
    e.preventDefault(); setError('');
    if (submitLock.current || isBusy) return;
    if (!files.length) { setError('Прикрепите хотя бы один скриншот.'); return; }
    if (pendingHook === 'standard' && !comment.trim()) { setError('Добавьте комментарий к результату норматива.'); return; }
    submitLock.current = true;
    setSendPhase('uploading');
    setUploadedCount(0);
    try {
      const uploadIds: string[] = [];
      for (const [index, file] of files.entries()) {
        const ticket = await upload.mutateAsync({ data: { name: file.name, size: file.size, contentType: file.type as 'image/jpeg' | 'image/png' | 'image/webp' } });
        const response = await fetch(ticket.uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
        if (!response.ok) {
          let message = '';
          try { const body = await response.json() as { error?: unknown }; if (typeof body.error === 'string') message = body.error; } catch { /* Use the status fallback below. */ }
          throw new Error(message || `Не удалось загрузить ${file.name} (HTTP ${response.status}).`);
        }
        uploadIds.push(ticket.uploadId);
        setUploadedCount(index + 1);
      }
      const payload = { comment: comment.trim(), uploadIds };
      setSendPhase('submitting');
      if (pendingHook === 'standard') await standardSubmit.mutateAsync({ id, data: payload });
      else if (pendingHook === 'task') await taskSubmit.mutateAsync({ id, data: payload });
      else await eventSubmit.mutateAsync({ id, data: payload });
      const queryKeys = [
        pendingHook === 'standard' ? getListStandardAssignmentsQueryKey() : pendingHook === 'task' ? getListTasksQueryKey() : getListEventsQueryKey(),
        pendingHook === 'standard' ? getListStandardSubmissionsQueryKey(id) : pendingHook === 'task' ? getListTaskSubmissionsQueryKey(id) : getListEventSubmissionsQueryKey(id),
      ];
      invalidate(qc, ...queryKeys);
      onSubmitted();
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Не удалось отправить отчёт. Проверьте соединение и повторите попытку.');
    } finally {
      submitLock.current = false;
      setSendPhase('idle');
    }
  };
  const submitLabel = sendPhase === 'uploading' ? `Загружаем скриншоты… ${uploadedCount}/${files.length}` : sendPhase === 'submitting' ? 'Отправляем отчёт…' : 'Отправить на проверку';
  return <Modal title={title} subtitle={detail} onClose={onClose} closeDisabled={isBusy} className="upload-modal"><form className="dialog-form" onSubmit={send} aria-busy={isBusy}>
    <div className="upload-instruction"><Camera size={19} /><div><strong>Подтвердите выполнение скриншотами</strong><span>Изображения JPG, PNG или WebP · до 25 МБ каждое · максимум {maxFiles} скриншотов</span></div></div>
    <label className="file-drop upload-drop"><ImagePlus size={22} /><strong>Выбрать скриншоты</strong><span>Выберите изображения из галереи или файлов</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => { addFiles(e.target.files); e.currentTarget.value = ''; }} disabled={isBusy || files.length >= maxFiles} data-testid="input-submission-images" /></label>
    {!!files.length && <div className="local-preview-grid">{previews.map(({ file, url }, index) => <div className="local-preview" key={`${file.name}-${index}`}><img src={url} alt={file.name} /><button type="button" aria-label={`Убрать ${file.name}`} onClick={() => setFiles((f) => f.filter((_, i) => i !== index))}><X size={13} /></button><span>{file.name}</span></div>)}</div>}
     <Field label={pendingHook === 'standard' ? 'Комментарий к результату (обязательно)' : 'Комментарий к отправке'}><textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} rows={3} required={pendingHook === 'standard'} placeholder="Что важно проверить?" /></Field>{error && <div className="form-error" role="alert">{error}</div>}
    <div className="dialog-actions"><button type="button" className="button button-secondary" onClick={onClose} disabled={isBusy}>Отмена</button><button className="button button-primary" disabled={isBusy || !files.length}><Upload size={15} />{submitLabel}</button></div>
  </form></Modal>;
}

function TasksPage({ user }: { user: SessionUser }) {
  const qc = useQueryClient(); const manager = user.role !== 'employee';
  const list = useListTasks({ query: { queryKey: getListTasksQueryKey(), refetchOnMount: 'always' } });
  const members = useListMembers({ query: { queryKey: getListMembersQueryKey(), enabled: manager } });
  const create = useCreateTask(); const cancelTask = useCancelTask();
  const [filter, setFilter] = useState('all'); const [createOpen, setCreateOpen] = useState(false); const [submissionFor, setSubmissionFor] = useState<Task | null>(null); const [historyFor, setHistoryFor] = useState<string | null>(null); const [cancelFor, setCancelFor] = useState<Task | null>(null);
  const [reviewNickname, setReviewNickname] = useState('');
  const [reviewRank, setReviewRank] = useState('');
  const membersById = useMemo(() => new Map((members.data ?? []).map((member) => [member.id, member])), [members.data]);
  const tasks = useMemo(() => (list.data ?? []).filter((task) =>
    (filter === 'all' || task.status === filter) &&
    (!manager || matchesReviewFilters(task.assigneeNickname ?? '', task.assigneeId, membersById, reviewNickname, reviewRank)),
  ), [list.data, filter, manager, membersById, reviewNickname, reviewRank]);
  const hasReviewFilters = !!reviewNickname.trim() || !!reviewRank;
  const save = (payload: { title: string; description: string; reason: string; assigneeId: string; priority: 'low' | 'normal' | 'high' | 'urgent'; dueAt: string }) => create.mutate({ data: { ...payload, dueAt: new Date(payload.dueAt).toISOString() } }, { onSuccess: () => { invalidate(qc, getListTasksQueryKey()); setCreateOpen(false); }, onError: () => alert('Не удалось создать поручение.') });
  const cancel = (reason: string) => { if (!cancelFor) return; cancelTask.mutate({ id: cancelFor.id, data: { reason } }, { onSuccess: () => { invalidate(qc, getListTasksQueryKey()); setCancelFor(null); }, onError: () => alert('Не удалось отменить поручение.') }); };
  if (list.isLoading) return <PageSkeleton />;
  if (list.isError) return <InlineError message="Не удалось загрузить поручения." onRetry={() => void list.refetch()} />;
  const filters = [['all', 'Все'], ['assigned', 'Назначено'], ['in_progress', 'В работе'], ['pending_review', 'На проверке'], ['revision_required', 'Доработка'], ['approved', 'Приняты'] ];
  return <><PageHeading eyebrow={manager ? 'ИСПОЛНЕНИЕ / КОНТРОЛЬ' : 'МОЯ СМЕНА / ПОРУЧЕНИЯ'} title="Поручения" description={manager ? 'Назначайте задачи, проверяйте доказательства и сохраняйте историю решений.' : 'Выполняйте служебные задачи и отправляйте подтверждения на проверку.'} action={manager && <button className="button button-primary" onClick={() => setCreateOpen(true)}><Plus size={16} /> Новое поручение</button>} />
    <div className="filter-tabs" role="tablist" aria-label="Фильтр поручений">{filters.map(([key, label]) => <button key={key} className={filter === key ? 'selected' : ''} onClick={() => setFilter(key)} role="tab" aria-selected={filter === key}>{label}</button>)}</div>
    {manager && <ReviewFilters nickname={reviewNickname} rank={reviewRank} onNicknameChange={setReviewNickname} onRankChange={setReviewRank} rankDisabled={members.isLoading || members.isError} rankHint={members.isLoading ? 'Загружаем список званий…' : members.isError ? 'Фильтр по званию временно недоступен.' : undefined} />}
    {!tasks.length ? <EmptyState title={hasReviewFilters ? 'По фильтрам поручений ничего не найдено' : filter === 'all' ? 'Поручений пока нет' : 'В этой категории пусто'} text={hasReviewFilters ? 'Измените ник или звание, чтобы увидеть другие поручения.' : manager ? 'Создайте задачу с исполнителем и понятным основанием.' : 'Новые поручения появятся здесь.'} action={manager && filter === 'all' && !hasReviewFilters && <button className="button button-primary" onClick={() => setCreateOpen(true)}><Plus size={16} /> Создать поручение</button>} /> : <div className="tasks-list">{tasks.map((task) => <TaskCard key={task.id} task={task} manager={manager} onSubmit={() => setSubmissionFor(task)} onHistory={() => setHistoryFor(task.id)} onCancel={() => setCancelFor(task)} />)}</div>}
    {createOpen && <Modal title="Новое поручение" subtitle="Укажите задачу, основание и срок исполнения." onClose={() => setCreateOpen(false)}><TaskCreateForm members={members.data ?? []} pending={create.isPending} onCancel={() => setCreateOpen(false)} onSubmit={save} /></Modal>}
    {submissionFor && <SubmitModal title="Отправить выполнение" detail={submissionFor.title} id={submissionFor.id} pendingHook="task" onClose={() => setSubmissionFor(null)} onSubmitted={() => setSubmissionFor(null)} />}
    {historyFor && <Modal title="История поручения" subtitle="Отправки и решения по доказательствам." onClose={() => setHistoryFor(null)} className="history-modal"><TaskHistory id={historyFor} manager={manager} onClose={() => setHistoryFor(null)} onUpdated={() => invalidate(qc, getListTasksQueryKey())} /></Modal>}
    {cancelFor && <ReasonDialog title="Отменить поручение" detail={`История задачи «${cancelFor.title}» останется в системе.`} label="Причина отмены обязательна" pending={cancelTask.isPending} onClose={() => setCancelFor(null)} onSubmit={cancel} />}
  </>;
}
function TaskCard({ task, manager, onSubmit, onHistory, onCancel }: { task: Task; manager: boolean; onSubmit: () => void; onHistory: () => void; onCancel: () => void }) {
   return <article className={`task-card task-card-rich status-edge-${task.status}`} data-testid={`card-task-${task.id}`}><div className={`task-priority-mark priority-${task.priority}`} /><div className="task-card-main"><div className="task-card-tags"><Badge status={task.status} /><span className={`priority-tag priority-${task.priority}`}>{LABEL[task.priority]} приоритет</span>{task.status === 'overdue' && <span className="overdue-note">Срок прошёл · без автоматического взыскания</span>}</div><h2>{task.title}</h2><p>{task.description || 'Описание не добавлено.'}</p>{task.reason && <div className="task-reason"><span>ОСНОВАНИЕ</span>{task.reason}</div>}<div className="task-card-meta"><span><Users size={13} />{task.assigneeNickname || 'Не назначен'}</span><span><CalendarDays size={13} />Выдано: {dateText(task.issuedAt, true)}</span><span><Clock3 size={13} />Срок: {dateText(task.dueAt, true)}</span></div>{task.latestReviewReason && <div className="review-note"><strong>Решение руководства</strong><span>{task.latestReviewReason}</span></div>}</div><div className="task-card-actions">{manager ? <><button className="button button-secondary button-small" onClick={onHistory}><History size={14} /> История</button>{task.status === 'pending_review' && <button className="button button-primary button-small" onClick={onHistory}><FileCheck2 size={14} /> Проверить</button>}{!['cancelled', 'approved'].includes(task.status) && <button className="button button-danger-outline button-small" onClick={onCancel}><Ban size={14} /> Отменить</button>}</> : <>{['assigned', 'in_progress', 'overdue'].includes(task.status) && <button className="button button-primary button-small" onClick={onSubmit}><Camera size={14} /> {task.versionCount ? 'Пересдать' : 'Отправить результат'}</button>}</>}</div></article>;
}
function TaskCreateForm({ members, pending, onCancel, onSubmit }: { members: Member[]; pending: boolean; onCancel: () => void; onSubmit: (v: { title: string; description: string; reason: string; assigneeId: string; priority: 'low' | 'normal' | 'high' | 'urgent'; dueAt: string }) => void }) {
  const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [reason, setReason] = useState(''); const [assigneeId, setAssigneeId] = useState(''); const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal'); const [dueAt, setDueAt] = useState('');
   return <form className="dialog-form" onSubmit={(e) => { e.preventDefault(); onSubmit({ title, description, reason, assigneeId, priority, dueAt }); }}><Field label="Название"><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required /></Field><Field label="Описание задачи"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={4000} /></Field><Field label="Основание поручения"><textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={2000} required /></Field><div className="form-split"><Field label="Исполнитель"><select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} required><option value="">Выберите сотрудника</option>{members.filter((m) => m.role === 'employee' && m.status === 'active').map((m) => <option key={m.id} value={m.id}>{m.nickname} · {m.rank}</option>)}</select></Field><Field label="Приоритет"><select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}><option value="low">Низкий</option><option value="normal">Обычный</option><option value="high">Высокий</option><option value="urgent">Срочный</option></select></Field></div><Field label="Срок исполнения"><input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} required /></Field><FormActions pending={pending} onCancel={onCancel} label="Поставить задачу" /></form>;
}
function TaskHistory({ id, manager, onClose, onUpdated }: { id: string; manager: boolean; onClose: () => void; onUpdated: () => void }) {
  const query = useListTaskSubmissions(id, { query: { queryKey: getListTaskSubmissionsQueryKey(id), refetchOnMount: 'always' } }); const review = useReviewTaskSubmission();
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved'); const [reason, setReason] = useState('');
  if (query.isLoading) return <PageSkeleton />;
  if (query.isError) return <InlineError message="История поручения недоступна." onRetry={() => void query.refetch()} />;
  const current = query.data?.find((s) => s.status === 'pending_review');
  const save = () => { if (!current || !reason.trim()) return; review.mutate({ id: current.id, data: { status: decision, reason: reason.trim() } }, { onSuccess: () => { void query.refetch(); onUpdated(); setReason(''); }, onError: () => alert('Не удалось сохранить решение.') }); };
  return <div className="submission-history">{!query.data?.length ? <EmptyState title="Отправок пока нет" text="Сотрудник ещё не отправлял скриншоты." /> : query.data.map((s) => <SubmissionEntry key={s.id} item={s} />)}{manager && current && <div className="review-box"><div className="section-kicker"><span /> ПРОВЕРКА ОТЧЁТА</div><Field label="Решение"><select value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)}><option value="approved">Принять</option><option value="rejected">Отклонить</option></select></Field><Field label="Причина решения (обязательно)"><textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} rows={3} required /></Field><div className="dialog-actions"><button className="button button-secondary" onClick={onClose}>Закрыть</button><button className="button button-primary" onClick={save} disabled={review.isPending || !reason.trim()}>{review.isPending ? 'Сохраняем…' : 'Сохранить решение'} <Check size={15} /></button></div></div>}</div>;
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
  const qc = useQueryClient();
  const query = useListMembers({ query: { queryKey: getListMembersQueryKey(), refetchOnMount: 'always' } });
  const points = usePoints();
  const create = useCreateMember(); const update = useUpdateMember(); const remove = useDeleteMember();
  const [search, setSearch] = useState(''); const [editing, setEditing] = useState<Member | null>(null); const [creating, setCreating] = useState(false); const [credentials, setCredentials] = useState<{ nickname: string; password: string } | null>(null);
  const [pointAdjustment, setPointAdjustment] = useState<{ member: Member; mode: 'award' | 'deduct' } | null>(null);
  const [memberError, setMemberError] = useState('');
  const leader = user.role === 'leader';
  const pointsByMember = useMemo(() => new Map((points.data ?? []).map((balance) => [balance.memberId, balance.points])), [points.data]);
  const filtered = (query.data ?? []).filter((m) => (m.nickname + ' ' + memberTitle(m.role, m.rank)).toLowerCase().includes(search.toLowerCase()));
  const save = (data: { nickname?: string; rank: string; status?: 'active' | 'blocked' }) => {
    setMemberError('');
    if (editing) update.mutate({ id: editing.id, data }, { onSuccess: () => { invalidate(qc, getListMembersQueryKey()); setEditing(null); }, onError: (error) => setMemberError(mutationErrorText(error, 'Не удалось сохранить изменения.')) });
    else create.mutate({ data: { nickname: data.nickname!, rank: data.rank } }, { onSuccess: (result) => { invalidate(qc, getListMembersQueryKey()); setCreating(false); setCredentials({ nickname: result.member.nickname, password: result.temporaryPassword }); }, onError: (error) => setMemberError(mutationErrorText(error, 'Не удалось добавить участника.')) });
  };
  if (query.isLoading || points.isLoading) return <PageSkeleton />;
  if (query.isError || points.isError) return <InlineError message="Не удалось загрузить состав и баллы сотрудников." onRetry={() => { void query.refetch(); void points.refetch(); }} />;
  return <><PageHeading eyebrow="УПРАВЛЕНИЕ / СОСТАВ" title="Личный состав" description="Звания, статус доступа и баллы сотрудников." action={<button className="button button-primary" onClick={() => { setMemberError(''); setCreating(true); }}><Plus size={16} /> Добавить участника</button>} />
    <div className="list-toolbar"><div className="search-box"><Search size={16} /><input placeholder="Поиск по имени или званию" value={search} onChange={(e) => setSearch(e.target.value)} /></div><span className="toolbar-count">{filtered.length} УЧАСТНИКОВ</span></div>
    {!filtered.length ? <EmptyState title="Никого не найдено" text="Измените запрос или добавьте сотрудника." /> : <div className="table-panel"><div className="table-scroll"><table className="data-table"><thead><tr><th>СОТРУДНИК</th><th>ЗВАНИЕ</th><th>СТАТУС</th><th>БАЛЛЫ</th><th>ПОСЛЕДНИЙ ВХОД</th><th /></tr></thead><tbody>{filtered.map((m) => <tr key={m.id}><td><div className="table-person"><div className="avatar avatar-table">{initials(m.nickname)}</div><div><strong>{m.nickname}</strong><span>В составе с {dateText(m.createdAt)}</span></div></div></td><td>{memberTitle(m.role, m.rank)}</td><td><Badge status={m.status} /></td><td><span className="member-points">{m.role === 'employee' ? pointsByMember.get(m.id) ?? 0 : '—'}</span></td><td>{dateText(m.lastLogin, true)}</td><td><div className="member-actions">{m.role === 'employee' && <><button className="icon-button points-award-action" aria-label={'Начислить баллы: ' + m.nickname} title="Начислить баллы" onClick={() => setPointAdjustment({ member: m, mode: 'award' })}>+</button><button className="icon-button points-deduct-action" aria-label={'Списать баллы: ' + m.nickname} title="Списать баллы" onClick={() => setPointAdjustment({ member: m, mode: 'deduct' })}>−</button></>}<button className="icon-button" aria-label={'Изменить ' + m.nickname} onClick={() => { setMemberError(''); setEditing(m); }}><Pencil size={15} /></button>{m.role === 'employee' && <button className="icon-button danger-icon" aria-label={'Исключить ' + m.nickname + ' из состава'} title="Исключить из состава" disabled={remove.isPending} onClick={() => { if (confirm('Исключить ' + m.nickname + ' из состава? Его доступ будет отключён, а история нормативов и поручений сохранится.')) remove.mutate({ id: m.id }, { onSuccess: () => { invalidate(qc, getListMembersQueryKey(), getGetDashboardQueryKey()); }, onError: (error) => alert(mutationErrorText(error, 'Не удалось исключить сотрудника из состава.')) }); }}><Trash2 size={15} /></button>}</div></td></tr>)}</tbody></table></div></div>}
    <div className="list-bottom-note"><Shield size={14} />{leader ? 'Лидер может изменять звания, управлять статусом доступа, начислять и списывать баллы.' : 'Администратор может изменять звания, исключать сотрудников из состава, начислять и списывать баллы.'}</div>
    {(creating || editing) && <Modal title={editing ? 'Карточка сотрудника' : 'Новый участник'} subtitle={editing?.nickname ?? 'Создание доступа в систему Правительства области'} onClose={() => { setCreating(false); setEditing(null); }}><MemberForm initial={editing} leader={leader} pending={create.isPending || update.isPending} error={memberError} onCancel={() => { setCreating(false); setEditing(null); }} onSubmit={save} /></Modal>}
    {credentials && <Modal title="Доступ создан" subtitle={'Учётная запись ' + credentials.nickname} onClose={() => setCredentials(null)}><div className="credentials-panel"><strong>Временный пароль</strong><code>{credentials.password}</code><p>Показывается один раз. Передайте его сотруднику безопасно.</p><button className="button button-secondary" onClick={() => void navigator.clipboard?.writeText(credentials.password)}>Копировать</button></div></Modal>}
    <PointsAdjustmentModal member={pointAdjustment?.member ?? null} mode={pointAdjustment?.mode ?? 'deduct'} currentPoints={pointAdjustment ? pointsByMember.get(pointAdjustment.member.id) ?? 0 : undefined} onClose={() => setPointAdjustment(null)} />
  </>;
}

function PointsAdjustmentModal({ member, mode, currentPoints, onClose }: { member: Member | null; mode: 'award' | 'deduct'; currentPoints?: number; onClose: () => void }) {
  const qc = useQueryClient();
  const award = useAwardPoints();
  const deduct = useDeductPoints();
  const [error, setError] = useState('');
  const isAward = mode === 'award';
  const pending = award.isPending || deduct.isPending;
  useEffect(() => { setError(''); }, [member?.id, mode]);
  if (!member) return null;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get('amount'));
    const reason = String(form.get('reason') ?? '').trim();
    const mutation = isAward ? award : deduct;
    mutation.mutate({ memberId: member.id, amount, reason }, {
      onSuccess: () => { invalidate(qc, getPointsQueryKey(), getListMembersQueryKey(), getGetDashboardQueryKey()); onClose(); },
      onError: (issue) => setError(mutationErrorText(issue, isAward ? 'Не удалось начислить баллы.' : 'Не удалось списать баллы.')),
    });
  };
  return <Modal title={isAward ? 'Начисление баллов' : 'Списание баллов'} subtitle={'Сотрудник ' + member.nickname + (currentPoints === undefined ? '' : ' · сейчас ' + currentPoints + ' баллов')} onClose={onClose} closeDisabled={pending}>
    <form className="dialog-form" onSubmit={submit}>
      <Field label="Количество баллов"><input name="amount" type="number" min={1} max={1000000} step={1} defaultValue={1} required /></Field>
      <Field label={isAward ? 'Причина начисления' : 'Причина списания'}><textarea name="reason" minLength={3} maxLength={400} required placeholder="Укажите причину изменения баланса" /></Field>
      {error && <div className="form-error" role="alert">{error}</div>}
      <FormActions pending={pending} onCancel={onClose} label={isAward ? 'Начислить баллы' : 'Списать баллы'} />
    </form>
  </Modal>;
}
function MemberForm({ initial, leader, pending, error, onCancel, onSubmit }: { initial: Member | null; leader: boolean; pending: boolean; error: string; onCancel: () => void; onSubmit: (data: { nickname?: string; rank: string; status?: 'active' | 'blocked' }) => void }) {
  const [nickname, setNickname] = useState(initial?.nickname ?? '');
  const currentTitle = initial ? memberTitle(initial.role, initial.rank) : '';
  const [rank, setRank] = useState(currentTitle);
  const [status, setStatus] = useState<'active' | 'blocked'>(initial?.status === 'blocked' ? 'blocked' : 'active');
  const titles = ['Вице-Губернатор', 'Депутат', 'Адвокат', 'Лицензер'];
  const rankOptions = leader ? ['Администратор', 'Лидер', ...titles] : titles;
  const options = initial && !rankOptions.includes(currentTitle) ? [currentTitle, ...rankOptions] : rankOptions;
  return <form className="dialog-form" onSubmit={(e) => { e.preventDefault(); onSubmit(initial ? { rank, ...(leader ? { status } : {}) } : { nickname, rank }); }}><>{!initial && <Field label="Игровое имя"><input value={nickname} onChange={(e) => setNickname(e.target.value)} minLength={3} maxLength={32} required /></Field>}<Field label="Звание"><select value={rank} onChange={(e) => setRank(e.target.value)} required><option value="" disabled>Выберите звание</option>{options.map((rankOption) => <option key={rankOption} value={rankOption}>{rankOption}</option>)}</select></Field>{leader && initial && <Field label="Доступ"><select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}><option value="active">Активен</option><option value="blocked">Заблокирован</option></select></Field>}</>{error && <div className="form-error" role="alert">{error}</div>}<FormActions pending={pending} onCancel={onCancel} label={initial ? 'Сохранить' : 'Создать доступ'} /></form>;
}

function EventsPage({ user }: { user: SessionUser }) {
  const qc = useQueryClient(); const query = useListEvents({ query: { queryKey: getListEventsQueryKey(), refetchOnMount: 'always' } }); const create = useCreateEvent(); const update = useUpdateEvent(); const remove = useDeleteEvent();
  const [open, setOpen] = useState(false); const [editing, setEditing] = useState<Event | null>(null); const [reportsFor, setReportsFor] = useState<Event | null>(null);
  const save = (payload: { title: string; description: string; startsAt: string; endsAt: string }) => {
    const done = () => { invalidate(qc, getListEventsQueryKey()); setOpen(false); setEditing(null); };
    if (editing) update.mutate({ id: editing.id, data: payload }, { onSuccess: done, onError: (error) => alert(mutationErrorText(error, 'Не удалось обновить мероприятие.')) }); else create.mutate({ data: payload }, { onSuccess: done, onError: (error) => alert(mutationErrorText(error, 'Не удалось создать мероприятие.')) });
  };
  return <><PageHeading eyebrow="ПЛАНИРОВАНИЕ / КАЛЕНДАРЬ" title="Мероприятия" description="Создавайте мероприятия и проверяйте отчёты сотрудников." action={<button className="button button-primary" onClick={() => setOpen(true)}><Plus size={16} /> Новое мероприятие</button>} />{query.isLoading ? <PageSkeleton /> : query.isError ? <InlineError message="Не удалось загрузить расписание." onRetry={() => void query.refetch()} /> : !query.data?.length ? <EmptyState title="Расписание чистое" text="Добавьте первое мероприятие для команды." action={<button className="button button-primary" onClick={() => setOpen(true)}>Запланировать</button>} /> : <div className="event-grid">{query.data.map((ev) => <article className="event-card" key={ev.id}><div className="event-date-block"><span>{new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(new Date(ev.startsAt)).toUpperCase()}</span><strong>{new Date(ev.startsAt).getDate().toString().padStart(2, '0')}</strong></div><div className="event-body"><div className="event-topline"><Badge status={ev.status} /><span><Clock3 size={12} />{dateText(ev.startsAt, true)}</span></div><h2>{ev.title}</h2><p>{ev.description || 'Описание не добавлено.'}</p><div className="event-schedule"><span>НАЧАЛО <strong>{dateText(ev.startsAt, true)}</strong></span><span>КОНЕЦ <strong>{ev.endsAt ? dateText(ev.endsAt, true) : 'Не назначен'}</strong></span></div><button className="button button-secondary button-small event-review-button" onClick={() => setReportsFor(ev)}><FileCheck2 size={14} /> Отчёты сотрудников</button></div><div className="event-actions"><button className="icon-button" aria-label="Изменить" onClick={() => { setEditing(ev); setOpen(true); }}><Pencil size={15} /></button><button className="icon-button danger-icon" aria-label="Удалить" onClick={() => confirm(`Удалить мероприятие «${ev.title}»? Вместе с ним удалится история отчётов.`) && remove.mutate({ id: ev.id }, { onSuccess: () => invalidate(qc, getListEventsQueryKey()), onError: () => alert('Не удалось удалить мероприятие.') })}><Trash2 size={15} /></button></div></article>)}</div>}{open && <Modal title={editing ? 'Изменить мероприятие' : 'Новое мероприятие'} subtitle="Укажите период проведения — в это время сотрудники смогут отправлять отчёты." onClose={() => { setOpen(false); setEditing(null); }}><EventForm initial={editing} pending={create.isPending || update.isPending} onCancel={() => { setOpen(false); setEditing(null); }} onSubmit={save} /></Modal>}{reportsFor && <EventReportsModal event={reportsFor} onClose={() => setReportsFor(null)} manager={user.role !== 'employee'} />}</>;
}
function EmployeeEventsPage() {
  const query = useListEvents({ query: { queryKey: getListEventsQueryKey(), refetchOnMount: 'always', refetchInterval: 30000 } });
  return <><PageHeading eyebrow="РАБОЧАЯ ЗОНА / ОТЧЁТЫ" title="Мероприятия" description="Начавшиеся мероприятия доступны здесь. Отправьте скриншоты во время работы — руководство проверит каждый отчёт." />{query.isLoading ? <PageSkeleton /> : query.isError ? <InlineError message="Не удалось загрузить мероприятия." onRetry={() => void query.refetch()} /> : !query.data?.length ? <EmptyState title="Мероприятий пока нет" text="Вкладка появится, когда начнётся назначенное мероприятие." /> : <div className="event-grid">{query.data.map((ev) => <EmployeeEventCard key={ev.id} event={ev} />)}</div>}</>;
}
function EmployeeEventCard({ event }: { event: Event }) {
  const query = useListEventSubmissions(event.id, { query: { queryKey: getListEventSubmissionsQueryKey(event.id), refetchOnMount: 'always' } });
  const [submitting, setSubmitting] = useState(false); const [showHistory, setShowHistory] = useState(false);
  const latest = query.data?.[0]; const now = Date.now(); const isActive = event.status === 'planned' && !!event.endsAt && new Date(event.startsAt).getTime() <= now && new Date(event.endsAt).getTime() > now; const canSubmit = isActive && !latest;
  const displayStatus = isActive ? 'in_progress' : event.status === 'planned' && event.endsAt && new Date(event.endsAt).getTime() <= now ? 'completed' : event.status;
  return <article className="event-card employee-event-card"><div className="event-date-block"><span>{new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(new Date(event.startsAt)).toUpperCase()}</span><strong>{new Date(event.startsAt).getDate().toString().padStart(2, '0')}</strong></div><div className="event-body"><div className="event-topline"><Badge status={displayStatus} /><span><Clock3 size={12} />{dateText(event.startsAt, true)}</span></div><h2>{event.title}</h2><p>{event.description || 'Описание не добавлено.'}</p><div className="event-schedule"><span>НАЧАЛО <strong>{dateText(event.startsAt, true)}</strong></span><span>КОНЕЦ <strong>{event.endsAt ? dateText(event.endsAt, true) : 'Не назначен'}</strong></span></div>{latest && <div className="event-report-status"><span>ПОСЛЕДНИЙ ОТЧЁТ</span><Badge status={latest.status} /></div>}<div className="event-employee-actions">{canSubmit ? <button className="button button-primary button-small" onClick={() => setSubmitting(true)} disabled={query.isLoading}><Camera size={14} />{latest ? 'Отправить повторно' : 'Отправить отчёт'}</button> : <span className="event-report-wait"><FileCheck2 size={14} />{latest?.status === 'pending_review' ? 'Отчёт на проверке' : latest?.status === 'approved' ? 'Отчёт принят' : latest?.status === 'rejected' ? 'Отчёт отклонён' : isActive ? 'Отчёт отправлен' : 'Период сдачи завершён'}</span>}{!!query.data?.length && <button className="button button-secondary button-small" onClick={() => setShowHistory((value) => !value)}>{showHistory ? 'Скрыть отчёты' : `Мои отчёты · ${query.data.length}`}</button>}</div>{query.isError && <div className="event-report-error">Не удалось загрузить историю отчётов.</div>}{showHistory && <div className="event-report-history">{query.data?.map((item) => <EventSubmissionEntry key={item.id} item={item} />)}</div>}</div>{submitting && <SubmitModal title={`Отчёт: ${event.title}`} detail="Прикрепите скриншоты выполненной работы." onClose={() => setSubmitting(false)} onSubmitted={() => { setSubmitting(false); void query.refetch(); }} id={event.id} pendingHook="event" />}</article>;
}
function EventReportsModal({ event, onClose, manager }: { event: Event; onClose: () => void; manager: boolean }) {
  const query = useListEventSubmissions(event.id, { query: { queryKey: getListEventSubmissionsQueryKey(event.id), refetchOnMount: 'always' } });
  const members = useListMembers({ query: { queryKey: getListMembersQueryKey(), enabled: manager } });
  const [reviewNickname, setReviewNickname] = useState('');
  const [reviewRank, setReviewRank] = useState('');
  const membersById = useMemo(() => new Map((members.data ?? []).map((member) => [member.id, member])), [members.data]);
  const visibleSubmissions = useMemo(() => (query.data ?? []).filter((item) =>
    !manager || matchesReviewFilters(item.memberNickname, item.memberId, membersById, reviewNickname, reviewRank),
  ), [query.data, manager, membersById, reviewNickname, reviewRank]);
  return <Modal title="Отчёты сотрудников" subtitle={event.title} onClose={onClose} className="event-reports-modal">
    {query.isLoading ? <PageSkeleton /> : query.isError ? <InlineError message="Не удалось загрузить отчёты." onRetry={() => void query.refetch()} /> : <>
      {manager && <ReviewFilters nickname={reviewNickname} rank={reviewRank} onNicknameChange={setReviewNickname} onRankChange={setReviewRank} rankDisabled={members.isLoading || members.isError} rankHint={members.isLoading ? 'Загружаем список званий…' : members.isError ? 'Фильтр по званию временно недоступен.' : undefined} />}
      {!query.data?.length ? <EmptyState title="Отчётов пока нет" text="Отправленные во время мероприятия скриншоты появятся здесь." /> : !visibleSubmissions.length ? <EmptyState title="По фильтрам отчётов нет" text="Измените ник или звание, чтобы увидеть другие отчёты." /> : <div className="event-report-history">{visibleSubmissions.map((item) => <EventSubmissionEntry key={item.id} item={item} manager={manager} onReviewed={() => void query.refetch()} />)}</div>}
    </>}
  </Modal>;
}
function EventSubmissionEntry({ item, manager = false, onReviewed }: { item: EventSubmission; manager?: boolean; onReviewed?: () => void }) {
  return <article className="submission-entry"><div className="submission-heading"><div><strong>{manager ? item.memberNickname : `Отчёт №${item.version}`}</strong><span>{dateText(item.submittedAt, true)}</span></div><Badge status={item.status} /></div>{item.comment && <p className="submission-comment">{item.comment}</p>}{item.decisionReason && <div className="review-note"><strong>{item.reviewerNickname ? `Решение · ${item.reviewerNickname}` : 'Комментарий руководства'}</strong><span>{item.decisionReason}</span></div>}<FileGallery files={item.files} />{manager && item.status === 'pending_review' && <EventSubmissionReview item={item} onReviewed={onReviewed ?? (() => undefined)} />}</article>;
}
function EventSubmissionReview({ item, onReviewed }: { item: EventSubmission; onReviewed: () => void }) {
  const review = useReviewEventSubmission(); const [decision, setDecision] = useState<'approved' | 'rejected'>('approved'); const [reason, setReason] = useState('');
  const submit = () => review.mutate({ id: item.id, data: { status: decision, ...(reason.trim() ? { reason: reason.trim() } : {}) } }, { onSuccess: () => { onReviewed(); setReason(''); }, onError: (error) => alert(mutationErrorText(error, 'Не удалось сохранить решение.')) });
  return <div className="review-box"><div className="section-kicker"><span /> РЕШЕНИЕ ПО ОТЧЁТУ</div><Field label="Решение"><select value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)}><option value="approved">Принять</option><option value="rejected">Отклонить</option></select></Field>{decision !== 'approved' && <Field label="Причина (обязательно)"><textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} rows={3} required placeholder="Объясните решение сотруднику" /></Field>}<button className="button button-primary button-small" disabled={review.isPending || (decision !== 'approved' && !reason.trim())} onClick={submit}>{review.isPending ? 'Сохраняем…' : 'Сохранить решение'} <Check size={14} /></button></div>;
}
function EventForm({ initial, pending, onCancel, onSubmit }: { initial: Event | null; pending: boolean; onCancel: () => void; onSubmit: (data: { title: string; description: string; startsAt: string; endsAt: string }) => void }) {
  const localDate = (v?: string | null) => v ? new Date(new Date(v).getTime() - new Date(v).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
  const [title, setTitle] = useState(initial?.title ?? ''); const [description, setDescription] = useState(initial?.description ?? ''); const [startsAt, setStartsAt] = useState(localDate(initial?.startsAt)); const [endsAt, setEndsAt] = useState(localDate(initial?.endsAt));
  return <form className="dialog-form" onSubmit={(e) => { e.preventDefault(); if (new Date(endsAt) <= new Date(startsAt)) { alert('Время окончания должно быть позже времени начала.'); return; } onSubmit({ title, description, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() }); }}><Field label="Название"><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required /></Field><div className="form-split"><Field label="Начало мероприятия — дата и время"><input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required /></Field><Field label="Окончание мероприятия — дата и время"><input type="datetime-local" value={endsAt} min={startsAt || undefined} onChange={(e) => setEndsAt(e.target.value)} required /></Field></div><Field label="Описание"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={4000} /></Field><FormActions pending={pending} onCancel={onCancel} label="Сохранить" /></form>;
}


function formatInactivityDate(value: string) {
  return value.split("-").reverse().join(".");
}

function moscowDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return year + "-" + month + "-" + day;
}

function InactivityPage({ user }: { user: SessionUser }) {
  const qc = useQueryClient();
  const requests = useInactivityRequests();
  const create = useCreateInactivityRequest();
  const review = useReviewInactivityRequest();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [filter, setFilter] = useState<InactivityRequestStatus>("pending_review");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const manager = user.role !== "employee";
  const allRequests = requests.data ?? [];
  const visibleRequests = manager
    ? allRequests.filter((item) => item.status === filter)
    : allRequests;
  const emptyContent: Record<InactivityRequestStatus, { title: string; text: string }> = {
    pending_review: {
      title: "Нет заявок на проверку",
      text: "Новые заявки сотрудников появятся здесь.",
    },
    approved: {
      title: "Одобренных заявок пока нет",
      text: "Заявки, которые вы одобрите, появятся здесь.",
    },
    rejected: {
      title: "Отказанных заявок пока нет",
      text: "Отклонённые заявки сотрудников появятся здесь.",
    },
    cancelled: {
      title: "Аннулированных заявок пока нет",
      text: "Аннулированные одобренные заявки появятся здесь.",
    },
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    create.mutate(
      { startDate, endDate, reason: reason.trim() },
      {
        onSuccess: () => {
          setStartDate("");
          setEndDate("");
          setReason("");
          setSuccess("Заявка отправлена на проверку.");
          invalidate(qc, getInactivityRequestsQueryKey());
        },
        onError: (issue) =>
          setError(mutationErrorText(issue, "Не удалось отправить заявку.")),
      },
    );
  };

  const decide = (
    item: InactivityRequest,
    status: "approved" | "rejected" | "cancelled",
  ) => {
    setError("");
    setSuccess("");
    review.mutate(
      { id: item.id, status },
      {
        onSuccess: () => {
          setSuccess(
            status === "cancelled"
              ? "Неактив аннулирован. Дневной норматив за сегодня восстановлен, если он настроен и нет другого одобренного неактива."
              : status === "approved"
                ? "Заявка одобрена."
                : "Заявка отклонена.",
          );
          invalidate(qc, getInactivityRequestsQueryKey());
        },
        onError: (issue) =>
          setError(mutationErrorText(issue, "Не удалось сохранить решение.")),
      },
    );
  };

  return <>
    <PageHeading
      eyebrow={manager ? "РАБОЧАЯ ЗОНА / СОГЛАСОВАНИЕ" : "РАБОЧАЯ ЗОНА / ЗАЯВКИ"}
      title="Неактив"
      description={manager
        ? "Проверяйте периоды неактива сотрудников и принимайте решение по заявкам."
        : "Укажите период отсутствия и причину — руководитель увидит заявку здесь."}
    />
    {manager ? <>
      <div className="inactivity-review-toolbar">
        <div className="filter-tabs" role="tablist" aria-label="Фильтр заявок на неактив">
          {INACTIVITY_REVIEW_TABS.map(({ status, label }) => (
            <button
              key={status}
              type="button"
              role="tab"
              aria-selected={filter === status}
              className={filter === status ? "selected" : ""}
              onClick={() => {
                setFilter(status);
                setSuccess("");
              }}
            >
              {label}
              <span>{allRequests.filter((item) => item.status === status).length}</span>
            </button>
          ))}
        </div>
      </div>
      {error && <div className="form-error inactivity-action-error" role="alert">{error}</div>}
      {success && <div className="inactivity-form-success inactivity-action-success" role="status">{success}</div>}
      {requests.isLoading ? <PageSkeleton /> : requests.isError
        ? <InlineError message="Не удалось загрузить заявки на неактив." onRetry={() => void requests.refetch()} />
        : !visibleRequests.length
          ? <EmptyState title={emptyContent[filter].title} text={emptyContent[filter].text} />
          : <div className="inactivity-request-list">
            {visibleRequests.map((item) => <article className="inactivity-request-card" key={item.id}>
              <div className="inactivity-request-header">
                <div className="inactivity-person">
                  <div className="avatar avatar-table">{initials(item.memberNickname)}</div>
                  <div><strong>{item.memberNickname}</strong><span>{item.memberRank}</span></div>
                </div>
                <Badge status={item.status} />
              </div>
              <div className="inactivity-period">
                <span>ПЕРИОД НЕАКТИВА</span>
                <strong>{formatInactivityDate(item.startDate)} — {formatInactivityDate(item.endDate)}</strong>
              </div>
              <div className="inactivity-reason"><span>ПРИЧИНА</span><p>{item.reason}</p></div>
              <div className="inactivity-request-meta">Подана {dateText(item.submittedAt, true)}{item.reviewerNickname ? ` · ${item.status === "cancelled" ? "Аннулировал(а)" : "Проверил(а)"}: ` + item.reviewerNickname : ""}</div>
              {item.status === "pending_review" && <div className="inactivity-actions">
                <button type="button" className="button button-danger-outline button-small" onClick={() => decide(item, "rejected")} disabled={review.isPending}>Отклонить</button>
                <button type="button" className="button button-primary button-small" onClick={() => decide(item, "approved")} disabled={review.isPending}>Одобрить <Check size={14} /></button>
              </div>}
              {item.status === "approved" && <div className="inactivity-actions">
                <button
                  type="button"
                  className="button button-danger-outline button-small"
                  disabled={review.isPending}
                  onClick={() => {
                    if (confirm("Аннулировать одобренный неактив? Если на сегодня для сотрудника настроен норматив и нет другого одобренного неактива, он появится сразу.")) {
                      decide(item, "cancelled");
                    }
                  }}
                >
                  Аннулировать
                </button>
              </div>}
            </article>)}
          </div>}
    </> : <div className="inactivity-employee-grid">
      <Panel title="Подать заявку" className="inactivity-panel">
        <form className="dialog-form inactivity-form" onSubmit={submit}>
          <div className="form-split">
            <Field label="С какого числа"><input type="date" value={startDate} max={endDate || undefined} onChange={(event) => setStartDate(event.target.value)} required /></Field>
            <Field label="По какое число"><input type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} required /></Field>
          </div>
          <Field label="Причина неактива"><textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={2000} rows={4} placeholder="Кратко объясните причину отсутствия" required /></Field>
          {error && <div className="form-error" role="alert">{error}</div>}
          {success && <div className="inactivity-form-success" role="status">{success}</div>}
          <button className="button button-primary" type="submit" disabled={create.isPending}>{create.isPending ? "Отправляем…" : "Отправить заявку"} <ArrowUpRight size={15} /></button>
        </form>
      </Panel>
      <Panel title="Мои заявки" meta={allRequests.length + " ВСЕГО"} className="inactivity-panel">
        {requests.isLoading ? <PageSkeleton /> : requests.isError
          ? <InlineError message="Не удалось загрузить историю заявок." onRetry={() => void requests.refetch()} />
          : !allRequests.length
            ? <EmptyState title="Заявок пока нет" text="Отправленные заявки и решения руководства появятся здесь." />
            : <div className="inactivity-request-list">
              {allRequests.map((item) => <article className="inactivity-request-card" key={item.id}>
                <div className="inactivity-request-header">
                  <div className="inactivity-period"><span>ПЕРИОД НЕАКТИВА</span><strong>{formatInactivityDate(item.startDate)} — {formatInactivityDate(item.endDate)}</strong></div>
                  <Badge status={item.status} />
                </div>
                <div className="inactivity-reason"><span>ПРИЧИНА</span><p>{item.reason}</p></div>
                <div className="inactivity-request-meta">Подана {dateText(item.submittedAt, true)}{item.reviewerNickname ? " · Решение: " + item.reviewerNickname : ""}</div>
              </article>)}
            </div>}
      </Panel>
    </div>}
  </>;
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
  'standard.daily_assigned': 'Автоматически назначен дневной норматив',
  'standard.daily_closed': 'Дневной норматив закрыт на проверку',
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
  const qc = useQueryClient(); const change = useChangePassword(); const logout = useLogout(); const [error, setError] = useState('');
  const submit = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); setError(''); const form = new FormData(e.currentTarget); const currentPassword = String(form.get('currentPassword')); const newPassword = String(form.get('newPassword')); if (newPassword !== String(form.get('confirmPassword'))) { setError('Новые пароли не совпадают.'); return; } if (newPassword.length < 10) { setError('Новый пароль должен содержать не менее 10 символов.'); return; } change.mutate({ data: { currentPassword, newPassword } }, { onSuccess: () => window.location.reload(), onError: (issue) => setError(mutationErrorText(issue, 'Не удалось сменить пароль.')) }); };
  const signOut = () => logout.mutate(undefined, { onSuccess: () => { qc.clear(); window.location.assign(import.meta.env.BASE_URL || '/'); } });
  return (
    <>
      <PageHeading eyebrow="АККАУНТ / ДОСТУП" title="Настройки" description="Безопасность учётной записи и текущей сессии." />
      <div className="settings-layout">
        <div className="settings-main">
          <Panel title="Сменить пароль" meta="БЕЗОПАСНОСТЬ">
            <div className="settings-intro"><div className="settings-icon"><KeyRound size={18} /></div><p>Минимальная длина нового пароля — 10 символов. Не передавайте пароль другим сотрудникам.</p></div>
            <form className="settings-form" onSubmit={submit}>
              <Field label="Текущий пароль"><input name="currentPassword" type="password" autoComplete="current-password" required /></Field>
              <Field label="Новый пароль"><input name="newPassword" type="password" minLength={10} maxLength={128} autoComplete="new-password" required /></Field>
              <Field label="Повторите пароль"><input name="confirmPassword" type="password" minLength={10} maxLength={128} autoComplete="new-password" required /></Field>
              {error && <div className="form-error">{error}</div>}
              <button className="button button-primary" disabled={change.isPending}>{change.isPending ? 'Сохраняем…' : 'Обновить пароль'}</button>
            </form>
          </Panel>
          <Panel title="Текущая сессия" meta="УПРАВЛЕНИЕ ДОСТУПОМ">
            <div className="session-details">
              <div><span>АККАУНТ</span><strong>{user.nickname}</strong></div>
              <div><span>ЗВАНИЕ</span><strong>{memberTitle(user.role, user.rank)}</strong></div>
            </div>
            <button className="button button-danger-outline" onClick={signOut} disabled={logout.isPending}><LogOut size={15} /> Завершить сессию</button>
          </Panel>
        </div>
        <aside className="settings-aside">
          <div className="account-card">
            <div className="avatar avatar-large">{initials(user.nickname)}</div>
            <span className="account-role">{memberTitle(user.role, user.rank)}</span>
            <h2>{user.nickname}</h2>
            <div className="account-divider" />
            <div className="account-fact"><span>СОСТОЯНИЕ</span><strong><i className="status-pulse" /> Активен</strong></div>
          </div>
        </aside>
      </div>
    </>
  );
}
export default App;
