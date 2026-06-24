import React, { useState } from 'react'
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
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { supabase } from '../../lib/supabase'
import { AuthStackParamList } from '../../navigation/RootNavigator'

type Props = NativeStackScreenProps<AuthStackParamList, 'PhoneLogin'>

const COUNTRY_CODE = '+961'

export default function PhoneLoginScreen({ navigation }: Props) {
  const [localNumber, setLocalNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const digits = localNumber.replace(/\D/g, '')
  const phone = `${COUNTRY_CODE}${digits}`
  const isValid = digits.length >= 7

  const handleSend = async () => {
    if (!isValid) {
      setError('Enter a valid Lebanese number (7–8 digits after +961).')
      return
    }
    setError(null)
    setLoading(true)
    const { error: apiError } = await supabase.auth.signInWithOtp({ phone })
    setLoading(false)
    if (apiError) {
      setError(apiError.message)
      return
    }
    navigation.navigate('OtpVerify', { phone })
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
          <View style={styles.header}>
            <Text style={styles.title}>Welcome to Souk</Text>
            <Text style={styles.subtitle}>
              Enter your Lebanese mobile number to sign in or create an account.
            </Text>
          </View>

          <View style={styles.inputRow}>
            <View style={styles.prefix}>
              <Text style={styles.prefixText}>{COUNTRY_CODE}</Text>
            </View>
            <TextInput
              style={styles.input}
              value={localNumber}
              onChangeText={(t) => {
                setError(null)
                setLocalNumber(t)
              }}
              placeholder="71 234 567"
              placeholderTextColor="#A89880"
              keyboardType="phone-pad"
              maxLength={12}
              autoFocus
              returnKeyType="send"
              onSubmitEditing={handleSend}
            />
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.button, (!isValid || loading) && styles.buttonMuted]}
            onPress={handleSend}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#FAF7F2" />
            ) : (
              <Text style={styles.buttonText}>Send Code</Text>
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
    paddingTop: 64,
    paddingBottom: 40,
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#D9CFC4',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    minHeight: 56,
    marginBottom: 16,
  },
  prefix: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    backgroundColor: '#F0EBE3',
    borderRightWidth: 1.5,
    borderRightColor: '#D9CFC4',
    justifyContent: 'center',
  },
  prefixText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1612',
  },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 18,
    color: '#1C1612',
    minHeight: 56,
  },
  errorBox: {
    backgroundColor: '#FDF0EC',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  errorText: {
    color: '#C8622A',
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#C8622A',
    borderRadius: 12,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
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
