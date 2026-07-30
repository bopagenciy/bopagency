// App-level type re-exports and UI-specific types

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  badge?: number;
};

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export type DemoData = {
  _demo: true;
};
