import React, { useEffect, useState } from 'react'
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/useAuthStore'

interface PendingReward {
  id: string
  code: string
  discount_pct: number
  milestone: number
}

// Checks for unseen reward vouchers once per session (mounted on app launch
// when a session exists) and celebrates them one at a time. Uses an inline
// Modal instead of Alert.alert — Alert onPress doesn't fire on Expo web.
export default function RewardCelebration() {
  const user = useAuthStore(s => s.user)
  const [queue, setQueue] = useState<PendingReward[]>([])

  useEffect(() => {
    if (!user?.id) {
      setQueue([])
      return
    }
    let cancelled = false

    async function fetchUnseen() {
      const { data, error } = await supabase
        .from('rewards')
        .select('id, code, discount_pct, milestone')
        .eq('user_id', user!.id)
        .eq('seen', false)
        .eq('status', 'active')
        .order('created_at', { ascending: true })

      if (cancelled || error || !data) return
      setQueue(data)
    }

    fetchUnseen()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const current = queue[0] ?? null
  if (!current) return null

  const dismiss = async () => {
    setQueue(prev => prev.slice(1))
    // Mark seen in the background — worst case the pop-up shows again next launch
    await supabase.from('rewards').update({ seen: true }).eq('id', current.id)
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.emoji}>🎉</Text>
          <Text style={styles.title}>Milestone unlocked!</Text>
          <Text style={styles.body}>
            You've completed {current.milestone} orders on Souk. Here's a{' '}
            <Text style={styles.bodyAccent}>{current.discount_pct}% discount</Text> to say thank
            you.
          </Text>
          <View style={styles.codeBox}>
            <Text style={styles.codeText}>{current.code}</Text>
          </View>
          <Text style={styles.hint}>Find this voucher anytime in your Profile.</Text>
          <TouchableOpacity style={styles.claimBtn} onPress={dismiss} activeOpacity={0.85}>
            <Text style={styles.claimBtnText}>Amazing, got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(28,22,18,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center',
    gap: 10,
  },
  emoji: {
    fontSize: 44,
  },
  title: {
    fontSize: 21,
    fontWeight: '800',
    color: '#1C1612',
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    color: '#7A6A5A',
    lineHeight: 21,
    textAlign: 'center',
  },
  bodyAccent: {
    color: '#D9552B',
    fontWeight: '800',
  },
  codeBox: {
    marginTop: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#D9552B',
    backgroundColor: '#F5EFE6',
  },
  codeText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1612',
    letterSpacing: 1.5,
    fontVariant: ['tabular-nums'],
  },
  hint: {
    fontSize: 12,
    color: '#7A6A5A',
  },
  claimBtn: {
    marginTop: 10,
    alignSelf: 'stretch',
    height: 56,
    borderRadius: 28,
    backgroundColor: '#D9552B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  claimBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
})
