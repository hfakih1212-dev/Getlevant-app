import React, { useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { supabase } from '../../lib/supabase'
import { AuthStackParamList } from '../../navigation/RootNavigator'

type Props = NativeStackScreenProps<AuthStackParamList, 'OtpVerify'>

const OTP_LENGTH = 6

export default function OtpVerifyScreen({ route, navigation }: Props) {
  const { phone } = route.params
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRefs = useRef<(TextInput | null)[]>(Array(OTP_LENGTH).fill(null))

  // Partially mask the phone for display: +961 •••• 567
  const maskedPhone = phone.replace(/(\+\d{3})(\d+)(\d{3})$/, '$1 •••• $3')

  const verify = async (token: string) => {
    setError(null)
    setLoading(true)
    const { error: apiError } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    })
    setLoading(false)
    if (apiError) {
      setError(apiError.message)
      setDigits(Array(OTP_LENGTH).fill(''))
      inputRefs.current[0]?.focus()
    }
    // On success, onAuthStateChange in useAuthStore drives navigation automatically
  }

  const handleChange = (value: string, index: number) => {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[index] = digit
    setDigits(next)
    setError(null)

    if (digit) {
      if (index < OTP_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus()
      } else if (next.every((d) => d !== '')) {
        verify(next.join(''))
      }
    }
  }

  const handleKeyPress = (
    e: NativeSyntheticEvent<TextInputKeyPressEventData>,
    index: number,
  ) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      const next = [...digits]
      next[index - 1] = ''
      setDigits(next)
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handleVerifyPress = () => {
    const token = digits.join('')
    if (token.length < OTP_LENGTH) {
      setError('Please enter the complete 6-digit code.')
      return
    }
    verify(token)
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.title}>Enter the code</Text>
            <Text style={styles.subtitle}>
              We sent a 6-digit code to{'\n'}
              <Text style={styles.phoneHighlight}>{maskedPhone}</Text>
            </Text>
          </View>

          <View style={styles.boxRow}>
            {digits.map((digit, i) => (
              <TextInput
                key={i}
                ref={(el) => {
                  inputRefs.current[i] = el
                }}
                style={[
                  styles.box,
                  digit ? styles.boxFilled : undefined,
                  error ? styles.boxError : undefined,
                ]}
                value={digit}
                onChangeText={(v) => handleChange(v, i)}
                onKeyPress={(e) => handleKeyPress(e, i)}
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
                autoFocus={i === 0}
                caretHidden
              />
            ))}
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonMuted]}
            onPress={handleVerifyPress}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#FAF7F2" />
            ) : (
              <Text style={styles.buttonText}>Verify</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FAF7F2',
  },
  flex: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
  },
  backButton: {
    minHeight: 44,
    justifyContent: 'center',
    marginBottom: 32,
    alignSelf: 'flex-start',
  },
  backText: {
    fontSize: 15,
    color: '#C8622A',
    fontWeight: '500',
  },
  header: {
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1C1612',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: '#7A6A5A',
  },
  phoneHighlight: {
    color: '#1C1612',
    fontWeight: '600',
  },
  boxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  box: {
    width: 48,
    height: 56,
    borderWidth: 1.5,
    borderColor: '#D9CFC4',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '700',
    color: '#1C1612',
  },
  boxFilled: {
    borderColor: '#C8622A',
    backgroundColor: '#FDF8F5',
  },
  boxError: {
    borderColor: '#C8622A',
    backgroundColor: '#FDF0EC',
  },
  errorBox: {
    backgroundColor: '#FDF0EC',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  errorText: {
    color: '#C8622A',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#C8622A',
    borderRadius: 12,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonMuted: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#FAF7F2',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
})
