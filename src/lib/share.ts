import { Platform, Share } from 'react-native'
import * as Clipboard from 'expo-clipboard'

// EAS Hosting production deployment — anyone can open these in a browser
// and browse as a guest. Paths mirror the linking config in RootNavigator.
export const WEB_BASE_URL = 'https://souk-app.expo.app'

export function productLink(productId: string): string {
  return `${WEB_BASE_URL}/product/${productId}`
}

export function storeLink(storeId: string): string {
  return `${WEB_BASE_URL}/store/${storeId}`
}

export type ShareOutcome = 'shared' | 'copied' | 'dismissed'

// Opens the native share sheet where one exists; on web falls back to the
// Web Share API and then to the clipboard so the action never dead-ends.
export async function shareLink(message: string, url: string): Promise<ShareOutcome> {
  if (Platform.OS === 'web') {
    const nav = globalThis.navigator as Navigator | undefined
    if (nav && typeof nav.share === 'function') {
      try {
        await nav.share({ text: message, url })
        return 'shared'
      } catch {
        return 'dismissed' // user closed the sheet
      }
    }
    await Clipboard.setStringAsync(`${message}\n${url}`)
    return 'copied'
  }

  try {
    const result = await Share.share(
      // iOS treats message and url as separate share items; Android only
      // forwards message, so the link must ride inside it.
      Platform.OS === 'ios' ? { message, url } : { message: `${message}\n${url}` },
    )
    return result.action === Share.dismissedAction ? 'dismissed' : 'shared'
  } catch {
    return 'dismissed'
  }
}
