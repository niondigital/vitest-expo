/**
 * Where the current route lives inside expo-router. The testing library reads
 * it from a different internal per SDK: SDK 57 keeps a store object with
 * `getRouteInfo()` and `state`; SDK 58 derives it from the navigation ref's
 * root state. Neither path is public API, so both are resolved at load time and
 * the one the installed version has wins.
 */
export interface RouteInfo {
  pathname: string;
  pathnameWithParams: string;
  segments: string[];
  params: Record<string, string | string[]>;
}

export interface RouteInfoSource {
  current(): RouteInfo;
  state(): unknown;
}

// Specifiers are kept out of static import analysis on purpose: only one of
// them resolves on a given SDK.
const NAVIGATION_REF = 'expo-router/build/global-state/navigationRef';
const ROUTE_INFO_FROM_STATE = 'expo-router/build/global-state/getRouteInfoFromState';
const ROUTER_STORE = 'expo-router/build/global-state/router-store';

export async function routeInfoSource(): Promise<RouteInfoSource> {
  try {
    const [{ navigationRef }, { getRouteInfoFromState }] = await Promise.all([
      import(/* @vite-ignore */ NAVIGATION_REF),
      import(/* @vite-ignore */ ROUTE_INFO_FROM_STATE),
    ]);
    return {
      current: () => getRouteInfoFromState(navigationRef.getRootState()),
      state: () => navigationRef.getRootState(),
    };
  } catch {
    const { store } = await import(/* @vite-ignore */ ROUTER_STORE);
    return {
      current: () => store.getRouteInfo(),
      state: () => store.state,
    };
  }
}
