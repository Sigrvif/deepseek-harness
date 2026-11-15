/**
 * The DSLRH brand occupants: the sidebar logo mark (the fork's own mark, not
 * the upstream whale) and the name plate (DSLRH + fork version, click to
 * copy). Registered over the upstream local-build fallbacks; the fork version
 * rides the build-time `DSH_CLIENT_FORK_VERSION` value.
 * @module @deepseek-ai/dsh-client-ui-fork-brand/client/ForkBrand
 */

import type { ReactNode } from 'react'
import { useClipboardCopy } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import dslrhMark from './assets/dslrh-smol.png'
import css from './ForkBrand.module.css'

/** The fork title as the name plate renders it. */
export const FORK_TITLE = 'DSLRH'

/**
 * The sidebar logo mark: the DSLRH artwork at the requested square edge.
 * @param props - the geometry the sidebar brand row supplies.
 * @returns the logo image.
 */
export function ForkBrandMark({ size }: SidebarBrandMarkOwnerProps): ReactNode {
  return <img src={dslrhMark} width={size} height={size} className={css.mark} alt="" />
}

/**
 * The sidebar name plate: the fork title over its version, click to copy the
 * version (the local-build fallbacks' behavior, kept).
 * @returns the name plate.
 */
export function ForkBrandName(): ReactNode {
  const forkVersion = process.env.DSH_CLIENT_FORK_VERSION
  const { copied, onCopy } = useClipboardCopy(forkVersion ?? '')
  return (
    <span
      className={css.plate}
      data-copy-version
      title={copied ? undefined : forkVersion}
      onClick={onCopy}
    >
      <span className={css.title}>{FORK_TITLE}</span>
      {forkVersion !== undefined && <span className={css.version}>{forkVersion}</span>}
    </span>
  )
}
