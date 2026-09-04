import { useEffect, useState } from "react";

export function useTheme() {
  const [dark, setDark] = useState(() => {
    return localStorage.getItem("hakidata_theme") === "dark";
  });

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("hakidata_theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("hakidata_theme", "light");
    }
  }, [dark]);

  return { dark, toggle: () => setDark(d => !d) };
}
