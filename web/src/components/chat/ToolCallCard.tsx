'use client';

import {
  FileText, Terminal, Image, Mail, MessageCircle,
  GitBranch, Globe, MapPin, Phone, Battery,
  Bell, Camera, Clipboard, Trash2, Search,
  FolderOpen, Edit, FilePlus, Loader2, Check, X
} from 'lucide-react';

interface ToolCallCardProps {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string;
  status: 'running' | 'success' | 'error' | 'pending_approval';
  onApprove?: (id: string, approved: boolean) => void;
}

const TOOL_ICONS: Record<string, React.ReactNode> = {
  read_file: <FileText size={16} />,
  write_file: <FilePlus size={16} />,
  edit_file: <Edit size={16} />,
  delete_file: <Trash2 size={16} />,
  list_directory: <FolderOpen size={16} />,
  search_files: <Search size={16} />,
  run_command: <Terminal size={16} />,
  gallery_list: <Image size={16} />,
  gallery_organize: <Image size={16} />,
  send_sms: <Phone size={16} />,
  get_contacts: <Phone size={16} />,
  get_location: <MapPin size={16} />,
  take_photo: <Camera size={16} />,
  get_clipboard: <Clipboard size={16} />,
  get_battery: <Battery size={16} />,
  get_notifications: <Bell size={16} />,
  send_email: <Mail size={16} />,
  send_telegram: <MessageCircle size={16} />,
  git_status: <GitBranch size={16} />,
  git_commit: <GitBranch size={16} />,
  git_clone: <GitBranch size={16} />,
  web_search: <Globe size={16} />,
  web_browse: <Globe size={16} />,
};

function getToolLabel(name: string): string {
  const labels: Record<string, string> = {
    read_file: 'Reading file',
    write_file: 'Writing file',
    edit_file: 'Editing file',
    delete_file: 'Deleting file',
    list_directory: 'Listing directory',
    search_files: 'Searching files',
    run_command: 'Running command',
    gallery_list: 'Listing gallery',
    gallery_organize: 'Organizing gallery',
    send_sms: 'Sending SMS',
    get_contacts: 'Getting contacts',
    get_location: 'Getting location',
    take_photo: 'Taking photo',
    get_clipboard: 'Reading clipboard',
    get_battery: 'Checking battery',
    get_notifications: 'Getting notifications',
    send_email: 'Sending email',
    send_telegram: 'Sending Telegram',
    git_status: 'Git status',
    git_commit: 'Git commit',
    git_clone: 'Cloning repo',
    web_search: 'Searching web',
    web_browse: 'Browsing web',
  };
  return labels[name] || name;
}

function getInputSummary(name: string, input: Record<string, unknown>): string {
  if (input.path) return String(input.path);
  if (input.command) return String(input.command).substring(0, 80);
  if (input.url) return String(input.url);
  if (input.query) return String(input.query);
  if (input.to) return `To: ${input.to}`;
  if (input.number) return `To: ${input.number}`;
  if (input.message) return String(input.message).substring(0, 60);
  return '';
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic'];

function extractImagePath(output: string): string | null {
  // Match paths like /storage/emulated/0/DCIM/photo.jpg
  const match = output.match(/(\/\S+\.(?:jpg|jpeg|png|gif|webp|bmp|heic))/i);
  return match ? match[1] : null;
}

function renderImagePreview(toolName: string, output: string) {
  const imageTools = ['take_photo', 'gallery_list'];
  const imgPath = extractImagePath(output);
  if (!imgPath) return null;

  const token = typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_AUTH_TOKEN || 'dev-token')
    : 'dev-token';
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const src = `${base}/api/gallery/image?path=${encodeURIComponent(imgPath)}&token=${token}`;

  return (
    <div className="mt-2">
      <img
        src={src}
        alt="Photo"
        className="max-w-full max-h-64 rounded-lg object-contain"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    </div>
  );
}

export default function ToolCallCard({ id, name, input, output, status, onApprove }: ToolCallCardProps) {
  const icon = TOOL_ICONS[name] || <Terminal size={16} />;
  const label = getToolLabel(name);
  const summary = getInputSummary(name, input);

  const statusColors = {
    running: 'border-blue-500/30 bg-blue-500/5',
    success: 'border-green-500/30 bg-green-500/5',
    error: 'border-red-500/30 bg-red-500/5',
    pending_approval: 'border-yellow-500/30 bg-yellow-500/5',
  };

  return (
    <div className={`my-2 rounded-lg border p-3 text-sm ${statusColors[status]}`}>
      <div className="flex items-center gap-2">
        <span className="text-[var(--muted-foreground)]">{icon}</span>
        <span className="font-medium">{label}</span>
        {status === 'running' && <Loader2 size={14} className="animate-spin text-blue-400" />}
        {status === 'success' && <Check size={14} className="text-green-400" />}
        {status === 'error' && <X size={14} className="text-red-400" />}
      </div>

      {summary && (
        <div className="mt-1 text-xs text-[var(--muted-foreground)] font-mono truncate">
          {summary}
        </div>
      )}

      {output && (
        <div className="mt-2 text-xs text-[var(--muted-foreground)] bg-black/20 rounded p-2 max-h-48 overflow-auto font-mono whitespace-pre-wrap">
          {output}
          {renderImagePreview(name, output)}
        </div>
      )}

      {status === 'pending_approval' && onApprove && (
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => onApprove(id, true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-green-600 hover:bg-green-500 text-white text-xs font-medium transition-colors"
          >
            <Check size={14} /> Approve
          </button>
          <button
            onClick={() => onApprove(id, false)}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-medium transition-colors"
          >
            <X size={14} /> Reject
          </button>
        </div>
      )}
    </div>
  );
}
