import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { CONDITION_LABEL, ProductCondition } from '../lib/catalog'

type Props = {
  condition: ProductCondition
  size?: 'sm' | 'md'
}

// Shared "Brand New / Thrifted" pill — overlaid on feed cards (sm) and inline
// on the product detail view (md)
export default function ConditionBadge({ condition, size = 'sm' }: Props) {
  const thrifted = condition === 'thrifted'
  return (
    <View
      style={[
        styles.base,
        size === 'md' ? styles.md : styles.sm,
        thrifted ? styles.thrifted : styles.brandNew,
      ]}
    >
      <Text style={[styles.text, size === 'md' && styles.textMd]}>
        {CONDITION_LABEL[condition]}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sm: {
    height: 20,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  md: {
    height: 26,
    paddingHorizontal: 12,
    borderRadius: 13,
  },
  brandNew: {
    backgroundColor: '#1C1612',
  },
  thrifted: {
    backgroundColor: '#2D7A4F',
  },
  text: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  textMd: {
    fontSize: 11,
  },
})
