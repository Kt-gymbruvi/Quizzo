// Ordner mit Unterordnern: Ein Quiz speichert seinen Ordner als Pfad, z. B. „Oberstufe/Evolution/Selektion“.
// Ein Ordner „gibt es“, solange irgendein Quiz darin oder in einem Unterordner liegt.

export const TRENNER = '/'
export const MAX_LAENGE = 60 // so lang darf der ganze Pfad sein (Datenbank-Regel)

/** Pfad aufräumen: Teile trimmen, doppelte Leerzeichen und leere Teile entfernen. Leer = ohne Ordner (null). */
export function ordnerPfad(eingabe: string | null | undefined): string | null {
  const teile = (eingabe ?? '')
    .split(TRENNER)
    .map((t) => t.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
  return teile.length ? teile.join(TRENNER) : null
}

export const ordnerTeile = (pfad: string) => pfad.split(TRENNER)
export const ordnerName = (pfad: string) => pfad.slice(pfad.lastIndexOf(TRENNER) + 1)
/** übergeordneter Ordner (null = oberste Ebene) */
export const elternOrdner = (pfad: string) => (pfad.includes(TRENNER) ? pfad.slice(0, pfad.lastIndexOf(TRENNER)) : null)
/** „Oberstufe › Evolution“ zum Anzeigen */
export const ordnerAnzeige = (pfad: string) => ordnerTeile(pfad).join(' › ')

/** Liegt ein Quiz mit Ordner `quizOrdner` in `ordner` oder einem seiner Unterordner? */
export const liegtIn = (quizOrdner: string | null, ordner: string) => !!quizOrdner && (quizOrdner === ordner || quizOrdner.startsWith(ordner + TRENNER))

/** Alle Ordner (auch die übergeordneten, in denen selbst kein Quiz liegt), sortiert */
export function alleOrdner(ordnerVonQuizzen: (string | null)[]): string[] {
  const alle = new Set<string>()
  for (const o of ordnerVonQuizzen) {
    if (!o) continue
    const teile = ordnerTeile(o)
    for (let i = 1; i <= teile.length; i++) alle.add(teile.slice(0, i).join(TRENNER))
  }
  return [...alle].sort(ordnerVergleich)
}

const vergleich = new Intl.Collator('de', { numeric: true, sensitivity: 'base' })
/** Sortierung als Baum: „A“, „A/x“, „A/y“, „B“ */
export function ordnerVergleich(a: string, b: string) {
  const ta = ordnerTeile(a)
  const tb = ordnerTeile(b)
  for (let i = 0; i < Math.min(ta.length, tb.length); i++) {
    const v = vergleich.compare(ta[i], tb[i])
    if (v) return v
  }
  return ta.length - tb.length
}

/** Direkte Unterordner von `eltern` (null = oberste Ebene) */
export const unterordner = (alle: string[], eltern: string | null) => alle.filter((o) => elternOrdner(o) === eltern)

/** Neuer Ordner eines Quizzes, wenn der Ordner `alt` zu `neu` wird (Unterordner wandern mit). undefined = nicht betroffen. */
export function umbenannt(quizOrdner: string | null, alt: string, neu: string | null): string | null | undefined {
  if (!liegtIn(quizOrdner, alt)) return undefined
  const rest = quizOrdner!.slice(alt.length) // '' oder '/Unterordner…'
  return ordnerPfad((neu ?? '') + rest)
}
