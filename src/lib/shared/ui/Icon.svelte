<script lang="ts">
  import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import ChartNoAxesCombined from '@lucide/svelte/icons/chart-no-axes-combined';
  import Files from '@lucide/svelte/icons/files';
  import Bell from '@lucide/svelte/icons/bell';
  import Megaphone from '@lucide/svelte/icons/megaphone';
  import Users from '@lucide/svelte/icons/users';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import Settings2 from '@lucide/svelte/icons/settings-2';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import Plus from '@lucide/svelte/icons/plus';
  import Check from '@lucide/svelte/icons/check';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import LogOut from '@lucide/svelte/icons/log-out';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import BookOpen from '@lucide/svelte/icons/book-open';
  import Clock3 from '@lucide/svelte/icons/clock-3';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import Search from '@lucide/svelte/icons/search';
  import Menu from '@lucide/svelte/icons/menu';
  import X from '@lucide/svelte/icons/x';
  import GraduationCap from '@lucide/svelte/icons/graduation-cap';
  import Download from '@lucide/svelte/icons/download';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import Inbox from '@lucide/svelte/icons/inbox';
  import FileText from '@lucide/svelte/icons/file-text';
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
  import CircleHelp from '@lucide/svelte/icons/circle-help';
  import Building2 from '@lucide/svelte/icons/building-2';
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  import Send from '@lucide/svelte/icons/send';
  import Square from '@lucide/svelte/icons/square';
  import MapPin from '@lucide/svelte/icons/map-pin';
  import Route from '@lucide/svelte/icons/route';
  import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
  import Copy from '@lucide/svelte/icons/copy';
  const icons = {
    home: LayoutDashboard,
    calendar: CalendarDays,
    chart: ChartNoAxesCombined,
    files: Files,
    bell: Bell,
    news: Megaphone,
    users: Users,
    shield: ShieldCheck,
    settings: Settings2,
    arrow: ArrowRight,
    plus: Plus,
    check: Check,
    down: ChevronDown,
    logout: LogOut,
    external: ExternalLink,
    book: BookOpen,
    clock: Clock3,
    left: ChevronLeft,
    search: Search,
    menu: Menu,
    x: X,
    cap: GraduationCap,
    download: Download,
    success: CircleCheck,
    inbox: Inbox,
    file: FileText,
    up: ArrowUpRight,
    help: CircleHelp,
    building: Building2,
    chat: MessageCircle,
    send: Send,
    stop: Square,
    pin: MapPin,
    route: Route,
    swap: ArrowLeftRight,
    copy: Copy
  };
  let { name, size = 20 }: { name: keyof typeof icons; size?: number } = $props();
  const Current = $derived(icons[name]);
</script>

<Current {size} strokeWidth={1.75} aria-hidden="true" />
