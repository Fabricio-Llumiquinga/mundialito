/**
 * Country flag emoji map for all 48 FIFA World Cup 2026 participating teams.
 * Maps team names to their corresponding flag emojis.
 */
export const COUNTRY_FLAGS: Record<string, string> = {
  // Group A
  'Mexico': '🇲🇽',
  'South Africa': '🇿🇦',
  'South Korea': '🇰🇷',
  'Czech Republic': '🇨🇿',

  // Group B
  'Canada': '🇨🇦',
  'Bosnia & Herzegovina': '🇧🇦',
  'Australia': '🇦🇺',
  'Bolivia': '🇧🇴',

  // Group C
  'Brazil': '🇧🇷',
  'Morocco': '🇲🇦',
  'Colombia': '🇨🇴',
  'New Zealand': '🇳🇿',

  // Group D
  'USA': '🇺🇸',
  'Paraguay': '🇵🇾',
  'Chile': '🇨🇱',
  'Cameroon': '🇨🇲',

  // Group E
  'Germany': '🇩🇪',
  'Curaçao': '🇨🇼',
  'Denmark': '🇩🇰',
  'Indonesia': '🇮🇩',

  // Group F
  'Belgium': '🇧🇪',
  'Ecuador': '🇪🇨',
  'Iran': '🇮🇷',
  'Costa Rica': '🇨🇷',

  // Group G
  'Netherlands': '🇳🇱',
  'Senegal': '🇸🇳',
  'Nigeria': '🇳🇬',
  'Jamaica': '🇯🇲',

  // Group H
  'Spain': '🇪🇸',
  'Cape Verde': '🇨🇻',
  'Turkey': '🇹🇷',
  'Egypt': '🇪🇬',

  // Group I
  'France': '🇫🇷',
  'Panama': '🇵🇦',
  'Uruguay': '🇺🇾',
  'Ghana': '🇬🇭',

  // Group J
  'Argentina': '🇦🇷',
  'Algeria': '🇩🇿',
  'Peru': '🇵🇪',
  'Saudi Arabia': '🇸🇦',

  // Group K
  'Portugal': '🇵🇹',
  'DR Congo': '🇨🇩',
  'Italy': '🇮🇹',
  'Ivory Coast': '🇨🇮',

  // Group L
  'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'Croatia': '🇭🇷',
  'Japan': '🇯🇵',
  'Serbia': '🇷🇸',

  // Additional team name variants
  'Switzerland': '🇨🇭',
  'Tunisia': '🇹🇳',
  'Poland': '🇵🇱',
  'Qatar': '🇶🇦',
  'Norway': '🇳🇴',
  'Ukraine': '🇺🇦',
  'Venezuela': '🇻🇪',
};

/**
 * Get the flag emoji for a team name. Returns empty string if not found.
 */
export function getFlag(teamName: string): string {
  return COUNTRY_FLAGS[teamName] ?? '';
}
