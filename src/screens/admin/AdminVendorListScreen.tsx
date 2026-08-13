import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  ListRenderItem,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Image } from 'expo-image'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useT } from '../../lib/i18n'
import { supabase } from '../../lib/supabase'
import type { AdminStackParamList } from '../../navigation/RootNavigator'

type Props = NativeStackScreenProps<AdminStackParamList, 'VendorList'>

interface VendorListItem {
  store_id: string
  name: string
  logo_url: string | null
  region: string | null
  status: string
}

const STATUS_COLOR: Record<string, string> = {
  active: '#166534',
  pending: '#92400E',
  suspended: '#991B1B',
  inactive: '#6B7280',
}

function statusColor(status: string): string {
  return STATUS_COLOR[status] ?? '#6B7280'
}

export default function AdminVendorListScreen({ navigation }: Props) {
  const t = useT()

  const [vendors, setVendors] = useState<VendorListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: rpcErr } = await supabase.rpc('admin_vendor_list')

    if (rpcErr) {
      setError(rpcErr.message)
    } else {
      setVendors((data as unknown as VendorListItem[]) ?? [])
    }

    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const renderItem: ListRenderItem<VendorListItem> = useCallback(
    ({ item }) => (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.75}
        onPress={() => navigation.navigate('VendorCard', { storeId: item.store_id, name: item.name })}
      >
        {item.logo_url ? (
          <Image source={{ uri: item.logo_url }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarFallbackText}>{item.name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.rowText}>
          <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
          <View style={styles.rowMeta}>
            <View style={[styles.statusDot, { backgroundColor: statusColor(item.status) }]} />
            <Text style={styles.rowMetaText} numberOfLines={1}>
              {item.status}{item.region ? ` · ${item.region}` : ''}
            </Text>
          </View>
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    ),
    [navigation],
  )

  const keyExtractor = useCallback((item: VendorListItem) => item.store_id, [])

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <ActivityIndicator size="large" color="#D9552B" />
      </SafeAreaView>
    )
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={load}>
          <Text style={styles.retryText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{t('adminVendorList.title')}</Text>
          <Text style={styles.headerSub}>{t('adminVendorList.subtitle')}</Text>
        </View>
      </View>

      <FlatList
        data={vendors}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>{t('adminVendorList.empty')}</Text>
          </View>
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ECE6DC',
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtnText: {
    fontSize: 20,
    color: '#1C1612',
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1612',
  },
  headerSub: {
    fontSize: 13,
    color: '#7A6A5A',
    marginTop: 2,
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F5EFE6',
    borderRadius: 14,
    padding: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#D9552B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarFallbackText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1612',
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  rowMetaText: {
    fontSize: 12,
    color: '#7A6A5A',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  chevron: {
    fontSize: 20,
    color: '#C9BDAE',
  },
  emptyState: {
    paddingTop: 64,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: '#7A6A5A',
  },
  errorText: {
    fontSize: 14,
    color: '#D9552B',
    textAlign: 'center',
    paddingHorizontal: 32,
    marginBottom: 16,
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#D9552B',
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#D9552B',
  },
})
