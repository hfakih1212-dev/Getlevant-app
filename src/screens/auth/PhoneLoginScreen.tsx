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

export default function PhoneLoginScreen({ navigation }: Props) {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  const handleSend = async () => {
    if (!isValid) {
      setError('Enter a valid email address.')
      return
    }
    setError(null)
    setLoading(true)
    const { error: apiError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    })
    setLoading(false)
    if (apiError) {
      setError(apiError.message)
      return
    }
    navigation.navigate('CheckEmail', { email: email.trim() })
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
              Enter your email address to sign in or create an account.
            </Text>
          </View>

          <TextInput
            style={styles.input}
            value={email}
            onChangeText={(t) => { setError(null); setEmail(t) }}
            placeholder="you@example.com"
            placeholderTextColor="#A89880"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.button, (!isValid || loading) && styles.buttonMuted]}
            onPress={handleSend}
            disabled={loading || !isValid}
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
  safe: { flex: 1, backgroundColor: '#FAF7F2' },
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 40,
  },
  header: { marginBottom: 40 },
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
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D9CFC4',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: '#1C1612',
    minHeight: 56,
    marginBottom: 16,
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
  buttonMuted: { opacity: 0.5 },
  buttonText: {
    color: '#FAF7F2',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
})
