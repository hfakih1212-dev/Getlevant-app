import React, { useCallback, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  ListRenderItem,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/useAuthStore'
import type { VendorStackParamList } from '../../navigation/RootNavigator'

type Props = NativeStackScreenProps<VendorStackParamList, 'ProductManagement'>

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

const fetchStoreProducts = (storeId: string) =>
  supabase
    .from('products')
    .select('id, name, price_usd, status, product_variants ( stock ), product_images ( url, position )')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })

type StoreProduct = NonNullable<
  Awaited<ReturnType<typeof fetchStoreProducts>>['data']
>[0]

const MAX_PHOTOS = 4

interface ImagePick { uri: string; key: string }
let _imgKey = 0
const mkImgKey = () => String(_imgKey++)

interface VariantDraft {
  key: string
  size: string
  color: string
  colorHex: string
  stock: string
}

// Module-level key so each variant gets a stable unique identity
let _vk = 0
const mkVariant = (): VariantDraft => ({
  key: String(_vk++),
  size: '', color: '', colorHex: '', stock: '',
})

type ScreenMode = 'list' | 'add'

// ---------------------------------------------------------------------------
// ProductCard
// ---------------------------------------------------------------------------

function ProductCard({ product }: { product: StoreProduct }) {
  const totalStock   = product.product_variants.reduce((sum, v) => sum + (v.stock ?? 0), 0)
  const variantCount = product.product_variants.length
  const isActive     = product.status === 'active'
  const coverUrl     = [...(product.product_images ?? [])]
    .sort((a, b) => a.position - b.position)[0]?.url ?? null

  return (
    <View style={styles.productCard}>
      <View style={styles.productCardRow}>
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={styles.productThumb} resizeMode="cover" />
        ) : (
          <View style={[styles.productThumb, styles.productThumbPlaceholder]} />
        )}

        <View style={styles.productCardBody}>
          <View style={styles.productCardHeader}>
            <Text style={styles.productName} numberOfLines={1}>{product.name}</Text>
            <View style={[styles.statusBadge, isActive ? styles.badgeActive : styles.badgeInactive]}>
              <Text style={[styles.statusBadgeText, isActive ? styles.badgeActiveText : styles.badgeInactiveText]}>
                {isActive ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </View>

          <Text style={styles.productPrice}>
            ${Number(product.price_usd).toFixed(2)} USD
          </Text>

          <View style={styles.productMeta}>
            <Text style={styles.variantCount}>
              {variantCount} variant{variantCount !== 1 ? 's' : ''}
            </Text>
            <Text style={totalStock > 0 ? styles.stockIn : styles.stockOut}>
              {totalStock > 0 ? `${totalStock} in stock` : 'Out of stock'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// VariantCard — one draft row inside the Add Product form
// ---------------------------------------------------------------------------

type VariantCardProps = {
  variant: VariantDraft
  index: number
  canRemove: boolean
  onUpdate: (key: string, field: keyof Omit<VariantDraft, 'key'>, value: string) => void
  onRemove: (key: string) => void
}

function VariantCard({ variant, index, canRemove, onUpdate, onRemove }: VariantCardProps) {
  return (
    <View style={styles.variantCard}>
      <View style={styles.variantCardHeader}>
        <Text style={styles.variantCardTitle}>Variant {index + 1}</Text>
        {canRemove && (
          <TouchableOpacity
            style={styles.variantRemoveBtn}
            onPress={() => onRemove(variant.key)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.variantRemoveText}>×</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Row 1: Size | Color */}
      <View style={styles.variantRow}>
        <View style={styles.variantField}>
          <Text style={styles.fieldLabel}>Size</Text>
          <TextInput
            style={styles.fieldInput}
            value={variant.size}
            onChangeText={v => onUpdate(variant.key, 'size', v)}
            placeholder="e.g. M"
            placeholderTextColor="#B0A090"
            returnKeyType="next"
          />
        </View>
        <View style={styles.variantField}>
          <Text style={styles.fieldLabel}>Color Name</Text>
          <TextInput
            style={styles.fieldInput}
            value={variant.color}
            onChangeText={v => onUpdate(variant.key, 'color', v)}
            placeholder="e.g. Navy Blue"
            placeholderTextColor="#B0A090"
            returnKeyType="next"
          />
        </View>
      </View>

      {/* Row 2: Hex | Stock */}
      <View style={styles.variantRow}>
        <View style={styles.variantField}>
          <Text style={styles.fieldLabel}>
            Hex <Text style={styles.optionalLabel}>(optional)</Text>
          </Text>
          <TextInput
            style={styles.fieldInput}
            value={variant.colorHex}
            onChangeText={v => onUpdate(variant.key, 'colorHex', v)}
            placeholder="#RRGGBB"
            placeholderTextColor="#B0A090"
            autoCapitalize="characters"
            returnKeyType="next"
          />
        </View>
        <View style={styles.variantField}>
          <Text style={styles.fieldLabel}>Stock</Text>
          <TextInput
            style={styles.fieldInput}
            value={variant.stock}
            onChangeText={v => onUpdate(variant.key, 'stock', v.replace(/[^0-9]/g, ''))}
            placeholder="0"
            placeholderTextColor="#B0A090"
            keyboardType="number-pad"
            returnKeyType="done"
          />
        </View>
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// ProductManagementScreen
// ---------------------------------------------------------------------------

export default function ProductManagementScreen({ navigation }: Props) {
  const user = useAuthStore(s => s.user)

  // Store
  const [storeId,   setStoreId]   = useState<string | null>(null)
  const [storeName, setStoreName] = useState('')

  // List
  const [products,    setProducts]    = useState<StoreProduct[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError,   setListError]   = useState<string | null>(null)

  // Mode
  const [mode, setMode] = useState<ScreenMode>('list')

  // Add-product form
  const [name,        setName]        = useState('')
  const [description, setDescription] = useState('')
  const [price,       setPrice]       = useState('')
  const [variants,    setVariants]    = useState<VariantDraft[]>(() => [mkVariant()])
  const [imagePicks,  setImagePicks]  = useState<ImagePick[]>([])
  const [saving,      setSaving]      = useState(false)
  const [formError,   setFormError]   = useState<string | null>(null)

  // ---- Data loading ----

  const load = useCallback(async () => {
    if (!user?.id) return
    setListLoading(true)
    setListError(null)

    const { data: store, error: storeErr } = await supabase
      .from('stores')
      .select('id, name')
      .eq('owner_id', user.id)
      .maybeSingle()

    if (storeErr) {
      setListError(storeErr.message)
      setListLoading(false)
      return
    }

    if (!store) {
      navigation.replace('StoreOnboarding')
      setListLoading(false)
      return
    }

    setStoreId(store.id)
    setStoreName(store.name)

    const { data, error: productsErr } = await fetchStoreProducts(store.id)
    if (productsErr) {
      setListError(productsErr.message)
    } else {
      setProducts(data ?? [])
    }

    setListLoading(false)
  }, [user?.id, navigation])

  useFocusEffect(useCallback(() => { load() }, [load]))

  // ---- Form helpers ----

  const resetForm = useCallback(() => {
    setName('')
    setDescription('')
    setPrice('')
    setVariants([mkVariant()])
    setImagePicks([])
    setFormError(null)
  }, [])

  const handlePickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to your photo library to add product images.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS,
      quality: 0.75,
      allowsEditing: false,
    })
    if (result.canceled) return
    setImagePicks(prev => {
      const remaining = MAX_PHOTOS - prev.length
      const toAdd = result.assets.slice(0, remaining).map(a => ({ uri: a.uri, key: mkImgKey() }))
      return [...prev, ...toAdd]
    })
  }, [])

  const removeImage = useCallback((key: string) => {
    setImagePicks(prev => prev.filter(p => p.key !== key))
  }, [])

  const openAdd = useCallback(() => {
    resetForm()
    setMode('add')
  }, [resetForm])

  const cancelAdd = useCallback(() => {
    resetForm()
    setMode('list')
  }, [resetForm])

  // ---- Variant mutation helpers ----

  const updateVariant = useCallback(
    (key: string, field: keyof Omit<VariantDraft, 'key'>, value: string) => {
      setVariants(prev =>
        prev.map(v => v.key === key ? { ...v, [field]: value } : v),
      )
    },
    [],
  )

  const addVariantRow = useCallback(() => {
    setVariants(prev => [...prev, mkVariant()])
  }, [])

  const removeVariantRow = useCallback((key: string) => {
    setVariants(prev => prev.length === 1 ? prev : prev.filter(v => v.key !== key))
  }, [])

  // ---- Save ----

  const handleSave = useCallback(async () => {
    setFormError(null)

    // Validate — use Alert so errors are visible regardless of scroll position
    if (!name.trim()) {
      Alert.alert('Missing field', 'Product name is required.')
      return
    }
    const priceNum = parseFloat(price)
    if (isNaN(priceNum) || priceNum <= 0) {
      Alert.alert('Invalid price', 'Enter a price greater than 0.')
      return
    }
    if (!storeId) {
      Alert.alert('No store', 'Could not find your store. Try going back and reopening Inventory.')
      return
    }

    // A variant row counts if at least one field is filled
    const validVariants = variants.filter(
      v => v.size.trim() || v.color.trim() || v.stock.trim(),
    )
    if (validVariants.length === 0) {
      Alert.alert('No variant', 'Fill in at least one variant row — add a size, colour, or stock count.')
      return
    }

    setSaving(true)

    try {
      // Step A — insert product
      const { data: product, error: productErr } = await supabase
        .from('products')
        .insert({
          store_id:    storeId,
          name:        name.trim(),
          description: description.trim() || null,
          price_usd:   priceNum,
          status:      'active',
        })
        .select('id')
        .single()

      if (productErr) throw productErr

      // Step B — batch-insert variants
      const { error: variantsErr } = await supabase
        .from('product_variants')
        .insert(
          validVariants.map(v => ({
            product_id: product.id,
            size:       v.size.trim()     || null,
            color:      v.color.trim()    || null,
            color_hex:  v.colorHex.trim() || null,
            stock:      parseInt(v.stock, 10) || 0,
          })),
        )

      if (variantsErr) throw variantsErr

      // Step C — upload images and record URLs
      for (let i = 0; i < imagePicks.length; i++) {
        const pick = imagePicks[i]
        const ext  = pick.uri.split('.').pop()?.toLowerCase() ?? 'jpg'
        const path = `${storeId}/${product.id}/${i}-${Date.now()}.${ext}`

        const response  = await fetch(pick.uri)
        const blob      = await response.blob()
        const { error: uploadErr } = await supabase.storage
          .from('product-images')
          .upload(path, blob, { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` })
        if (uploadErr) throw uploadErr

        const { data: { publicUrl } } = supabase.storage
          .from('product-images')
          .getPublicUrl(path)

        const { error: imgRowErr } = await supabase
          .from('product_images')
          .insert({ product_id: product.id, url: publicUrl, position: i })
        if (imgRowErr) throw imgRowErr
      }

      // Success — reload list and return to list mode
      await load()
      setMode('list')
      resetForm()
    } catch (err: unknown) {
      Alert.alert(
        'Save Failed',
        err instanceof Error ? err.message : 'Something went wrong.',
      )
    } finally {
      setSaving(false)
    }
  }, [name, price, description, storeId, variants, imagePicks, load, resetForm])

  // ---- FlatList helpers ----

  const renderProduct: ListRenderItem<StoreProduct> = useCallback(
    ({ item }) => <ProductCard product={item} />,
    [],
  )

  const keyExtractor = useCallback((item: StoreProduct) => item.id, [])

  // ---- Render: Add form ----

  if (mode === 'add') {
    return (
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Add header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.headerBackBtn}
              onPress={cancelAdd}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.headerBackIcon}>←</Text>
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle}>New Product</Text>
              <Text style={styles.headerSub}>{storeName}</Text>
            </View>
            <View style={styles.headerRight} />
          </View>

          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.formScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ── Product details ── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Product Details</Text>

              <Text style={styles.inputLabel}>
                Name <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Handwoven Leather Tote"
                placeholderTextColor="#B0A090"
                returnKeyType="next"
              />

              <Text style={styles.inputLabel}>
                Description <Text style={styles.optionalLabel}>(optional)</Text>
              </Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                value={description}
                onChangeText={setDescription}
                placeholder="Describe materials, craftsmanship, care instructions…"
                placeholderTextColor="#B0A090"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              <Text style={styles.inputLabel}>
                Price (USD) <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={price}
                onChangeText={setPrice}
                placeholder="0.00"
                placeholderTextColor="#B0A090"
                keyboardType="decimal-pad"
                returnKeyType="next"
              />
            </View>

            {/* ── Photos ── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Photos{' '}
                <Text style={styles.optionalLabel}>(up to {MAX_PHOTOS})</Text>
              </Text>

              <View style={styles.photoGrid}>
                {imagePicks.map(pick => (
                  <View key={pick.key} style={styles.photoSlot}>
                    <Image source={{ uri: pick.uri }} style={styles.photoThumb} resizeMode="cover" />
                    <TouchableOpacity
                      style={styles.photoRemoveBtn}
                      onPress={() => removeImage(pick.key)}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    >
                      <Text style={styles.photoRemoveText}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                {imagePicks.length < MAX_PHOTOS && (
                  <TouchableOpacity
                    style={styles.photoAddSlot}
                    onPress={handlePickImage}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.photoAddIcon}>+</Text>
                    <Text style={styles.photoAddLabel}>Add Photo</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* ── Variants ── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Variants</Text>
              <Text style={styles.sectionHint}>
                Add a row for each size/colour combination you carry.
              </Text>

              {variants.map((v, idx) => (
                <VariantCard
                  key={v.key}
                  variant={v}
                  index={idx}
                  canRemove={variants.length > 1}
                  onUpdate={updateVariant}
                  onRemove={removeVariantRow}
                />
              ))}

              <TouchableOpacity
                style={styles.addVariantBtn}
                onPress={addVariantRow}
                activeOpacity={0.8}
              >
                <Text style={styles.addVariantBtnText}>+ Add Variant</Text>
              </TouchableOpacity>
            </View>

            {/* Inline validation error */}
            {formError ? (
              <Text style={styles.formError}>{formError}</Text>
            ) : null}
          </ScrollView>

          {/* ── Sticky save button ── */}
          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              <Text style={styles.saveBtnText}>
                {saving ? 'Saving…' : 'Save Product'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  // ---- Render: Product list ----

  return (
    <SafeAreaView style={styles.safe}>
      {/* List header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBackBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.headerBackIcon}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Inventory</Text>
          <Text style={styles.headerSub}>{storeName}</Text>
        </View>
        <TouchableOpacity
          style={styles.addProductBtn}
          onPress={openAdd}
          activeOpacity={0.8}
        >
          <Text style={styles.addProductBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Body */}
      {listLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#C8622A" />
        </View>
      ) : listError ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{listError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={keyExtractor}
          renderItem={renderProduct}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No products yet</Text>
              <Text style={styles.emptyBody}>
                Tap "+ Add" to list your first product in the marketplace.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FAF7F2' },
  flex: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Header (shared between list + add modes)
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E0D5',
  },
  headerBackBtn:  { width: 40, height: 44, justifyContent: 'center' },
  headerBackIcon: { fontSize: 22, color: '#1C1612', lineHeight: 26 },
  headerCenter:   { flex: 1, alignItems: 'center' },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1612',
  },
  headerSub: {
    fontSize: 12,
    color: '#7A6A5A',
    marginTop: 1,
  },
  headerRight: { width: 40 },
  // "+ Add" button in list header
  addProductBtn: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#C8622A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addProductBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FAF7F2',
  },
  // Product list
  listContent: {
    padding: 16,
    gap: 12,
    flexGrow: 1,
  },
  // Product card
  productCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#1C1612',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  productCardRow: {
    flexDirection: 'row',
  },
  productThumb: {
    width: 80,
    height: 80,
  },
  productThumbPlaceholder: {
    backgroundColor: '#E8E0D5',
  },
  productCardBody: {
    flex: 1,
    padding: 12,
    gap: 4,
  },
  productCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1612',
    marginRight: 8,
  },
  productPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: '#C8622A',
  },
  productMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0EBE3',
  },
  variantCount: {
    fontSize: 12,
    color: '#7A6A5A',
  },
  stockIn:  { fontSize: 12, fontWeight: '600', color: '#166534' },
  stockOut: { fontSize: 12, fontWeight: '600', color: '#991B1B' },
  // Status badge
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  statusBadgeText:    { fontSize: 11, fontWeight: '700' },
  badgeActive:        { backgroundColor: '#DCFCE7' },
  badgeActiveText:    { color: '#166534' },
  badgeInactive:      { backgroundColor: '#F3F4F6' },
  badgeInactiveText:  { color: '#6B7280' },
  // Add-product form scroll
  formScrollContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 24,
  },
  // Section cards
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    gap: 10,
    shadowColor: '#1C1612',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1612',
    marginBottom: 2,
  },
  sectionHint: {
    fontSize: 12,
    color: '#7A6A5A',
    lineHeight: 17,
    marginTop: -4,
  },
  // Inputs
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1612',
  },
  required:      { color: '#C8622A' },
  optionalLabel: { fontWeight: '400', color: '#7A6A5A' },
  input: {
    backgroundColor: '#FAF7F2',
    borderWidth: 1.5,
    borderColor: '#D9CFC4',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1C1612',
    minHeight: 48,
  },
  inputMultiline: {
    minHeight: 88,
    paddingTop: 12,
  },
  // Variant card
  variantCard: {
    backgroundColor: '#FAF7F2',
    borderWidth: 1,
    borderColor: '#E8E0D5',
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  variantCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  variantCardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7A6A5A',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  variantRemoveBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F0EBE3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  variantRemoveText: {
    fontSize: 18,
    color: '#7A6A5A',
    lineHeight: 22,
    textAlign: 'center',
  },
  // 2-column variant field row
  variantRow: {
    flexDirection: 'row',
    gap: 8,
  },
  variantField: {
    flex: 1,
    gap: 4,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7A6A5A',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  fieldInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D9CFC4',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#1C1612',
    minHeight: 44,
  },
  // Photo grid
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoSlot: {
    width: 80,
    height: 80,
    borderRadius: 10,
    overflow: 'hidden',
  },
  photoThumb: {
    width: 80,
    height: 80,
  },
  photoRemoveBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(28,22,18,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoRemoveText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center',
  },
  photoAddSlot: {
    width: 80,
    height: 80,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#D9CFC4',
    borderStyle: 'dashed',
    backgroundColor: '#FAF7F2',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  photoAddIcon: {
    fontSize: 22,
    color: '#7A6A5A',
    lineHeight: 26,
  },
  photoAddLabel: {
    fontSize: 10,
    color: '#7A6A5A',
    fontWeight: '500',
  },
  // Add Variant button
  addVariantBtn: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#D9CFC4',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  addVariantBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7A6A5A',
  },
  // Inline form error
  formError: {
    fontSize: 13,
    color: '#C8622A',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  // Sticky save button
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: '#FAF7F2',
    borderTopWidth: 1,
    borderTopColor: '#E8E0D5',
  },
  saveBtn: {
    backgroundColor: '#C8622A',
    borderRadius: 12,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.38 },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FAF7F2',
    letterSpacing: 0.3,
  },
  // Empty / error states
  emptyState: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 80,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1612',
  },
  emptyBody: {
    fontSize: 14,
    color: '#7A6A5A',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 14,
    color: '#C8622A',
    textAlign: 'center',
    paddingHorizontal: 32,
    marginBottom: 16,
  },
  retryBtn: {
    height: 44,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#C8622A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#C8622A',
  },
})
