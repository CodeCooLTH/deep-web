export type SubdomainType = "main" | "seller" | "admin";

export function getSubdomain(host: string): SubdomainType {
  const hostname = host.split(":")[0];
  if (hostname.startsWith("seller.")) return "seller";
  if (hostname.startsWith("admin.")) return "admin";
  return "main";
}

export function getLoginPath(subdomain: SubdomainType): string {
  switch (subdomain) {
    case "seller": return "/auth/sign-in";
    case "admin": return "/admin/auth/sign-in";
    default: return "/auth/sign-in";
  }
}
