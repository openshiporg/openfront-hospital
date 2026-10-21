import Link from 'next/link'
import { StorefrontShell, EmergencyNotice } from '@/features/storefront/components/StorefrontShell'
export default function PublicNotFound() { return <StorefrontShell><section className="sf-container sf-workbench"><h1 className="sf-display sf-display--section">Page not found</h1><p>This page or visit type is unavailable. No appointment change is implied.</p><Link className="sf-btn sf-btn--secondary" href="/book">View appointment requests</Link><EmergencyNotice /></section></StorefrontShell> }
