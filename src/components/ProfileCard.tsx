import type { Profile } from '../types'

export function ProfileCard({ profile }: { profile: Profile }) {
  return (
    <div className="flex items-center gap-4">
      {profile.avatar ? (
        <img
          src={profile.avatar}
          alt=""
          className="h-14 w-14 rounded-full object-cover ring-1 ring-line"
        />
      ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 font-display text-xl text-muted ring-1 ring-line">
          {profile.username.charAt(0).toUpperCase()}
        </div>
      )}
      <div>
        <h2 className="font-display text-2xl font-semibold leading-tight">{profile.username}</h2>
        <a
          href={profile.url}
          className="text-sm font-medium text-accent hover:text-accent-press hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          View on Chess.com ↗
        </a>
      </div>
    </div>
  )
}
