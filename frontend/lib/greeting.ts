export function getGreeting(date: Date): string {
  const hour = date.getHours()
  if (hour < 11) return "Selamat pagi."
  if (hour < 15) return "Selamat siang."
  if (hour < 18) return "Selamat sore."
  return "Selamat malam."
}
