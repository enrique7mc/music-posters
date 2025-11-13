/**
 * Icon Component Library
 *
 * This file exports all icons used in the application:
 * - Lucide React icons for common UI elements (search, folder, etc.)
 * - Custom AI-generated music icons for branding
 */

// ============================================================================
// LUCIDE REACT ICONS (Common UI Elements)
// ============================================================================
// These are imported from the lucide-react library
// Use these for standard UI interactions: navigation, actions, status indicators

export {
  Search,           // 🔍 Magnifying glass - used for search/analyze actions
  Folder,           // 📁 File folder - used for upload buttons
  FolderOpen,       // 📂 Open folder - alternative for active upload state
  CheckCircle,      // ✅ Success checkmark - used for completed states
  XCircle,          // ❌ Error indicator - used for error states
  AlertCircle,      // ⚠️ Warning indicator - used for warnings
  Sparkles,         // ✨ Sparkles - used for magic/special effects
  Star,             // ⭐ Star - used for ratings/favorites (can also use custom)
} from 'lucide-react'

// ============================================================================
// CUSTOM MUSIC ICONS (AI-Generated for Branding)
// ============================================================================
// These will be replaced with AI-generated SVGs that match your brand style
// Currently using Lucide placeholders until custom SVGs are ready

// Loading animation icons
export { Guitar as CustomGuitar } from 'lucide-react'           // 🎸 Will be replaced with custom guitar SVG
export { Mic as CustomMicrophone } from 'lucide-react'         // 🎤 Will be replaced with custom mic SVG
export { Music as CustomMusicNote } from 'lucide-react'        // 🎵 Will be replaced with custom note SVG
export { Music2 as CustomMusicNotes } from 'lucide-react'      // 🎶 Will be replaced with custom double notes SVG
export { Headphones as CustomHeadphones } from 'lucide-react'  // 🎧 Will be replaced with custom headphones SVG
export { Piano as CustomPiano } from 'lucide-react'            // 🎹 Will be replaced with custom piano SVG

// Additional music icons (Lucide doesn't have all, these will need custom SVGs)
export { Music as CustomTrumpet } from 'lucide-react'          // 🎺 NEEDS CUSTOM SVG
export { Music as CustomViolin } from 'lucide-react'           // 🎻 NEEDS CUSTOM SVG
export { Music as CustomMusicSheet } from 'lucide-react'       // 🎼 NEEDS CUSTOM SVG
export { Disc3 as CustomVinyl } from 'lucide-react'            // 💿 Will be replaced with custom vinyl SVG

// Special effects icons
export { PartyPopper as CustomPartyPopper } from 'lucide-react' // 🎪 Will be replaced with custom tent/stage SVG

// Tier badge icons
export { Guitar as HeadlinerIcon } from 'lucide-react'         // 🎸 Headliner badge - will be custom
export { Star as SubHeadlinerIcon } from 'lucide-react'        // ⭐ Sub-headliner badge - will be custom

/**
 * TODO: Replace placeholder exports with actual custom SVG components
 *
 * Example custom component structure:
 *
 * export const CustomGuitar = ({ className = "w-6 h-6" }: { className?: string }) => (
 *   <svg className={className} viewBox="0 0 24 24" fill="currentColor">
 *     <path d="YOUR_AI_GENERATED_SVG_PATH_HERE" />
 *   </svg>
 * )
 *
 * Then import and use with Tailwind classes:
 * <CustomGuitar className="w-8 h-8 text-purple-500" />
 */
