import { createRouter } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    defaultErrorComponent: AppErrorComponent,
    // A delayed route render must not scroll back to the skip-link hash after
    // the owner has already moved keyboard focus into a workspace control.
    scrollRestoration: () => typeof document === "undefined" ||
      !document.activeElement?.matches("#operator-task :focus-visible"),
  });
}
