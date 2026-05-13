/**
 * Language context. Wrap App with <I18nProvider>, then use `useT()` anywhere.
 *
 *   const { t, lang, setLang } = useT()
 *   <h1>{t.appTitle}</h1>
 *   <button onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')}>...</button>
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { dictionaries, type Lang, type Strings } from './strings'

const LANG_KEY = 'floodwatch.lang'

interface I18nValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: Strings
}

const Ctx = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem(LANG_KEY)
    return saved === 'en' || saved === 'vi' ? saved : 'vi' // default Vietnamese
  })

  useEffect(() => {
    localStorage.setItem(LANG_KEY, lang)
    document.documentElement.lang = lang
  }, [lang])

  const setLang = (l: Lang) => setLangState(l)

  return (
    <Ctx.Provider value={{ lang, setLang, t: dictionaries[lang] }}>
      {children}
    </Ctx.Provider>
  )
}

export function useT(): I18nValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useT must be used inside <I18nProvider>')
  return v
}
