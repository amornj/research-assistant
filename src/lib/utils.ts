export const uid = () => Math.random().toString(36).slice(2, 10)

export const slugifyTag = (value: string) =>
  value.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

export const formatReference = (ref: {
  number: number
  title: string
  creators?: string[]
  publicationTitle?: string
  date?: string
  doi?: string
}) => {
  const authorText = ref.creators?.length ? ref.creators.join(', ') : 'Unknown authors'
  const journal = ref.publicationTitle ? ` ${ref.publicationTitle}.` : ''
  const year = ref.date ? ` ${ref.date}.` : ''
  const doi = ref.doi ? ` DOI: ${ref.doi}` : ''
  return `${ref.number}. ${authorText}. ${ref.title}.${journal}${year}${doi}`.replace(/\s+/g, ' ').trim()
}
