import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  // SSR-safe: stay `false` on the server AND the first client render (so hydration
  // matches), then resolve the real value after mount. Reading window in the
  // initializer would diverge from SSR and throw a hydration mismatch.
  const [isMobile, setIsMobile] = React.useState<boolean>(false)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    onChange()
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}
