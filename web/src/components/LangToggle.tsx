import { useT } from '../i18n/context'

export function LangToggle() {
  const { lang, setLang } = useT()
  return (
    <div className="flex items-center bg-white/10 backdrop-blur-sm rounded-full p-0.5 text-xs font-semibold">
      <button
        onClick={() => setLang('vi')}
        className={`px-2.5 py-1 rounded-full transition ${
          lang === 'vi' ? 'bg-white text-brand' : 'text-white/70 hover:text-white'
        }`}
        aria-label="Tiếng Việt"
      >
        VI
      </button>
      <button
        onClick={() => setLang('en')}
        className={`px-2.5 py-1 rounded-full transition ${
          lang === 'en' ? 'bg-white text-brand' : 'text-white/70 hover:text-white'
        }`}
        aria-label="English"
      >
        EN
      </button>
    </div>
  )
}
