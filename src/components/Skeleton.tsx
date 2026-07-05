import React, { useEffect, useRef } from 'react'
import { Animated, StyleProp, StyleSheet, ViewStyle } from 'react-native'

type Props = { style?: StyleProp<ViewStyle> }

// Soft opacity pulse — shared by every screen's loading placeholder
export default function Skeleton({ style }: Props) {
  const opacity = useRef(new Animated.Value(0.45)).current

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 650, useNativeDriver: true }),
      ]),
    )
    pulse.start()
    return () => pulse.stop()
  }, [opacity])

  return <Animated.View style={[styles.base, style, { opacity }]} />
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: '#F0E9DF',
    borderRadius: 8,
  },
})
