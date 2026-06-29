type IconProps = {
  className?: string;
  size?: number;
};

function IconBase({
  children,
  className,
  size = 20,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width={size}
    >
      {children}
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </IconBase>
  );
}

export function LoginIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <path d="m10 17 5-5-5-5" />
      <path d="M15 12H3" />
    </IconBase>
  );
}

export function UserPlusIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9.5" cy="7" r="4" />
      <path d="M19 8v6" />
      <path d="M22 11h-6" />
    </IconBase>
  );
}

export function FileTextIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
      <path d="M10 9H8" />
    </IconBase>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
      <path d="m9 12 2 2 4-4" />
    </IconBase>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </IconBase>
  );
}

export function BuildingIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 21h18" />
      <path d="M5 21V5a2 2 0 0 1 2-2h7v18" />
      <path d="M19 21V9a2 2 0 0 0-2-2h-3" />
      <path d="M9 7h1" />
      <path d="M9 11h1" />
      <path d="M9 15h1" />
    </IconBase>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2l-.08.62a2 2 0 0 1-2.93 1.46l-.54-.31a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.46.35a2 2 0 0 1 0 3.28l-.46.35a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.54-.31a2 2 0 0 1 2.93 1.46l.08.62a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2l.08-.62a2 2 0 0 1 2.93-1.46l.54.31a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.46-.35a2 2 0 0 1 0-3.28l.46-.35a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.54.31a2 2 0 0 1-2.93-1.46L14.22 4a2 2 0 0 0-2-2" />
      <circle cx="12" cy="12" r="3" />
    </IconBase>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m9 18 6-6-6-6" />
    </IconBase>
  );
}
