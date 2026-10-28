import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { AccessScreen } from "@/components/access-screen";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return <AccessScreen mode="checking" />;
  if (user) return <Navigate to="/" />;
  return <AccessScreen mode="login" />;
}
