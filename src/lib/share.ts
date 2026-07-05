import { Platform, Share } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import * as Linking from 'expo-linking'

// souk://product/<id> on native; http(s)://<host>/product/<id> on web —
// paths must mirror the linking config in RootNavigator.
export function productLink(productId: string): string {
  return Linking.createURL(`product/${productId}`)
}

export function storeLink(storeId: string): string {
  return Linking.createURL(`store/${storeId}`)
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
