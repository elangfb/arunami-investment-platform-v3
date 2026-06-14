'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  createApplicationDocs,
  extractApplicationDocs,
  fetchApplicationDocs,
  fetchDocumentVersions,
  regenerateApplicationDocs,
  rollbackDocumentVersion,
  type DocsState,
  type DocumentVersionDTO,
} from './docs-api'
import type { SeedContext } from './seed-context'

export type DocsBusy = false | 'create' | 'regenerate' | 'sync' | 'rollback'

export function useApplicationDocs(appId: string, seed?: SeedContext) {
  const [state, setState] = useState<DocsState | null>(null)
  const [versions, setVersions] = useState<DocumentVersionDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<DocsBusy>(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [docs, versions] = await Promise.all([fetchApplicationDocs(appId), fetchDocumentVersions(appId)])
      setState(docs)
      setVersions(versions)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [appId])

  useEffect(() => {
    // Fetch on mount; refresh() manages its own loading/error state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

  const create = useCallback(async () => {
    setBusy('create')
    setError(null)
    try {
      await createApplicationDocs(appId, seed)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [appId, seed, refresh])

  const regenerate = useCallback(async () => {
    setBusy('regenerate')
    setError(null)
    try {
      await regenerateApplicationDocs(appId, seed)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [appId, seed, refresh])

  const sync = useCallback(async () => {
    setBusy('sync')
    setError(null)
    try {
      await extractApplicationDocs(appId)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [appId, refresh])

  const rollback = useCallback(async (versionId: string) => {
    setBusy('rollback')
    setError(null)
    try {
      await rollbackDocumentVersion(appId, versionId)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [appId, refresh])

  return { state, versions, loading, busy, error, create, regenerate, sync, rollback, refresh }
}
