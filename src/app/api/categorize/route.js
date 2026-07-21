import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { categoryForDescription, classifyMerchantDescriptions } from '@/lib/merchant-categorization'
import { normalizeMerchantName } from '@/lib/categorize'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Faça login novamente.' }, { status: 401 })

    const { data: expenses, error: expenseError } = await supabase
      .from('expenses')
      .select('id, description, category')
      .eq('user_id', user.id)
      .or('category.is.null,category.eq.')
      .limit(200)
    if (expenseError) throw expenseError
    if (!expenses?.length) return NextResponse.json({ updated: 0, local: 0, saved: 0, researched: 0, fallback: 0 })

    const { data: savedRules } = await supabase
      .from('merchant_category_rules')
      .select('merchant_key, category, confidence, source')
      .eq('user_id', user.id)

    const classifications = await classifyMerchantDescriptions({
      apiKey: process.env.GEMINI_API_KEY,
      descriptions: expenses.map(item => item.description),
      cachedRules: savedRules || [],
      allowSearch: true,
    })

    const counts = { updated: 0, local: 0, saved: 0, researched: 0, fallback: 0 }
    const learned = new Map()
    for (const expense of expenses) {
      const classification = categoryForDescription(classifications, expense.description)
      const { error } = await supabase.from('expenses')
        .update({ category: classification.category })
        .eq('id', expense.id)
        .eq('user_id', user.id)
        .or('category.is.null,category.eq.')
      if (error) throw error
      counts.updated++
      if (classification.source === 'local') counts.local++
      else if (classification.source === 'saved') counts.saved++
      else if (classification.source === 'search') counts.researched++
      else counts.fallback++

      if (classification.source === 'search') {
        const merchantKey = normalizeMerchantName(expense.description)
        learned.set(merchantKey, {
          user_id: user.id,
          merchant_key: merchantKey,
          display_name: String(expense.description || '').slice(0, 120),
          category: classification.category,
          source: 'search',
          confidence: classification.confidence,
          updated_at: new Date().toISOString(),
        })
      }
    }
    if (learned.size) {
      await supabase.from('merchant_category_rules').upsert([...learned.values()], { onConflict: 'user_id,merchant_key' })
    }
    return NextResponse.json(counts)
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Não foi possível categorizar.' }, { status: 500 })
  }
}
