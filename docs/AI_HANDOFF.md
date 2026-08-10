# Planado AI Handoff

Last updated: 2026-08-10

## Read this first

This document is the source of truth for an AI continuing work on Planado. Inspect the repository before editing because some items described as pending may have changed since this file was written. Preserve user changes and do not replace working backend code with mock implementations.

Project location:

```text
C:\Users\Admin\Planado
```

## Product in one sentence

Planado is a friendly mobile-first shared calendar where private friend groups coordinate plans, see who is busy, join with invite codes, and eventually use AI to find common free time and summarize their year.

## Product principles

1. The shared calendar is the product; AI is an enhancement, not the foundation.
2. Planning with friends should feel lighter than managing a work calendar.
3. A user should understand who is involved in an event at a glance.
4. Private group data must always be protected by Supabase RLS.
5. Screens call hooks, hooks call services, and services call Supabase.
6. Google is the only authentication method. Do not add passwords.

## Current stack

- Expo SDK 57
- React Native 0.86
- React 19
- TypeScript in strict mode
- Expo Router
- Supabase Auth, PostgreSQL, Storage, and Realtime
- Google OAuth through Supabase
- AsyncStorage for native session persistence
- Browser development at `http://localhost:8081`
- Android package and iOS bundle ID: `com.planado.app`
- Deep-link scheme: `planado`

## Current implementation status

Implemented:

- Valid Expo and TypeScript project configuration
- Supabase client in `services/supabase.ts`
- Google-only OAuth methods in `services/authService.ts`
- Session provider in `context/AuthContext.tsx`
- `useAuth` hook
- Basic Google login test screen
- Root redirect from `/` to `/login`
- Initial Supabase schema migration
- Follow-up Google profile migration
- Google provider and redirect configuration were set up manually by the user

Still empty or not implemented:

- Main tab layout
- Home screen
- Calendar screen
- Groups screen
- Profile screen
- Group screens
- Event screens
- `groupService.ts`
- `inviteService.ts`
- `eventService.ts`
- `useGroups.ts`
- `useEvents.ts`
- Notifications and AI services
- Generated Supabase database types
- Automated backend/RLS tests

Important: verify that `20260808000000_support_google_auth_profiles.sql` was actually run against the hosted Supabase project. The file existing locally does not prove it was applied remotely.

## Authentication decisions

Authentication is Google-only.

Do not add:

- Email/password sign-up
- Password login
- Password reset
- Confirm-password fields
- Email verification screens
- Password management settings

The login screen should call:

```ts
await signInWithGoogle();
```

The OAuth flow is:

```text
Planado
-> system browser or web popup
-> Google account selection
-> Supabase OAuth callback
-> Planado callback
-> Supabase session stored
```

Allowed mobile redirects:

```text
planado://auth/callback
planado://**
```

Allowed web-development redirect:

```text
http://localhost:8081/**
```

Never put the Google client secret or Supabase service-role key in Expo code or `.env`.

## First-login onboarding

Google provides a name, email, and usually an avatar. It does not provide a suitable unique Planado username or a group-specific member color.

After first login, the generated profile should have:

```text
onboarding_completed = false
```

Create this route if it does not exist:

```text
app/(auth)/complete-profile.tsx
```

Ask for:

- Username
- Display-name confirmation
- Timezone
- Preferred starter color

After successful validation, call `updateMyProfile()` with `onboarding_completed: true`.

Startup routing should become:

```text
Session loading -> loading screen
No session -> /login
Session + incomplete profile -> /complete-profile
Session + complete profile -> /(tabs)/home
```

## Database model

The database already defines:

- `profiles`
- `groups`
- `group_members`
- `group_invites`
- `events`
- `event_responses`
- `notifications`
- `user_devices`
- `ai_summaries`

Key design rules:

- `auth.users` is managed by Supabase.
- `profiles.id` matches `auth.users.id`.
- Membership is many-to-many through `group_members`.
- Member colors belong to `group_members`, not `profiles`, because a user can have different colors in different groups.
- Invite joining must use the secure `join_group_by_code` RPC.
- Group creation must use `create_group` so the creator becomes owner atomically.
- Ownership transfer must use `transfer_group_ownership`.
- Notifications and AI summary writes should come from trusted server-side code.
- Screens must never bypass service functions with ad hoc direct database writes.

## Required service layer

Implement services before connecting full UI flows.

### `groupService.ts`

Required functions:

```text
createGroup
getMyGroups
getGroup
getGroupMembers
updateGroup
deleteGroup
leaveGroup
removeMember
updateMember
transferOwnership
```

### `inviteService.ts`

Required functions:

```text
createInvite
getInvites
disableInvite
deleteInvite
joinGroupByCode
```

### `eventService.ts`

Required functions:

```text
createEvent
getEvent
getGroupEvents
updateEvent
cancelEvent
deleteEvent
respondToEvent
getEventResponses
```

Calendar queries must filter by `group_id` and visible date range. Do not fetch all events.

### Hooks

`useGroups` and `useEvents` should expose:

- Data
- Initial loading
- Refreshing
- Error
- Refresh method
- Mutation methods where appropriate
- Realtime subscription lifecycle

## Main application routes

```text
app/
|-- _layout.tsx
|-- index.tsx
|-- (auth)/
|   |-- login.tsx
|   `-- complete-profile.tsx
|-- (tabs)/
|   |-- _layout.tsx
|   |-- home.tsx
|   |-- calendar.tsx
|   |-- groups.tsx
|   `-- profile.tsx
|-- group/
|   |-- create.tsx
|   |-- join.tsx
|   |-- [groupId].tsx
|   |-- members.tsx
|   |-- invite.tsx
|   `-- settings.tsx
|-- event/
|   |-- create.tsx
|   `-- [eventId].tsx
`-- notifications.tsx
```

## UI direction

### Overall feeling

The interface should feel like planning a weekend with close friends, not operating corporate scheduling software.

Use:

- Warm, light backgrounds
- Rounded surfaces
- Clear typography
- Friendly empty states
- Small, purposeful use of member colors
- Generous spacing
- Minimal visual noise

Avoid:

- Dense enterprise dashboards
- Large spreadsheets or table-heavy layouts
- Excessive gradients
- Neon colors across entire screens
- Glass effects on every surface
- Tiny calendar controls
- Showing raw database errors

### Recommended color system

This is the default direction unless the user provides a brand system later.

```text
Canvas                 #F7F7FB
Surface                #FFFFFF
Primary indigo         #5B5CE2
Primary pressed        #4748C8
Primary soft           #EEEEFF
Text primary           #17171C
Text secondary         #686873
Border                  #E7E7EE
Success                 #2F9E6F
Warning                 #E59B32
Danger                  #D9534F
```

Member colors may include blue, green, amber, purple, coral, cyan, and pink. Always pair color with a name, avatar, initials, or label.

### Typography

- Use the system font initially for reliable native rendering.
- Page title: 28-32 px, bold.
- Section title: 18-20 px, semibold.
- Card title: 15-17 px, semibold.
- Body: 14-16 px.
- Supporting text: 12-14 px.
- Use strong hierarchy rather than many different font weights.

### Shape and spacing

```text
Screen horizontal padding: 20
Section gap: 24
Card padding: 16
Small gap: 8
Normal gap: 12
Large gap: 20
Card radius: 18
Button radius: 14
Input radius: 14
Minimum touch target: 44 x 44
```

### Navigation

Use a four-item bottom tab bar:

```text
Home | Calendar | Groups | Profile
```

The active tab uses primary indigo. Inactive tabs use secondary gray. Keep labels visible; do not rely on icons alone.

Notifications are opened from a bell in the Home header rather than occupying a fifth tab.

### Login screen visual

The login screen should be calm and simple:

```text
[Planado mark]
Planado
Make time for your people.

[small illustration or overlapping calendar/member cards]

[ G  Continue with Google ]

Terms and Privacy
```

Use one primary Google button, no password fields, and no secondary registration link.

### Home screen visual

Recommended composition:

```text
Good morning, Karl                         [avatar] [bell]
Your plans with friends

[ Next plan - large featured card ]

Quick actions
[Create event] [Create group] [Join group]

Your groups                              See all
[group card] [group card]

Coming up
[compact event row]
[compact event row]
```

The next-event card may use a soft tint based on the event category or creator color. Do not use a full-screen saturated background.

### Calendar screen visual

The calendar is the visual center of Planado.

- Put month navigation and group selection at the top.
- Use large, tappable day cells.
- Show small colored member dots beneath dates.
- Highlight today with a subtle outlined circle.
- Highlight the selected day with the primary filled circle.
- Show selected-day events in a vertically scrolling list below.
- Use a floating or clearly placed Create Event button.

An event row should communicate, in order:

```text
member color/avatar -> time -> title -> group/category -> RSVP
```

### Groups screen visual

Use vertically stacked group cards. Each card contains:

- Image or generated initials
- Group name
- Member avatar stack
- Member count
- Next event summary
- Current user's role only when useful

Place Create Group and Join Group near the header. One can be primary and the other secondary.

### Group detail visual

Use a compact group hero with image, title, description, and avatar stack. Follow with:

1. Next event
2. Mini calendar or seven-day strip
3. Upcoming event list
4. Member preview

Owner/admin actions belong in an overflow or settings button, not the main content hierarchy.

### Forms

- Use persistent field labels above inputs.
- Show validation beneath the affected field.
- Keep the primary submit button visible without excessive scrolling when possible.
- Date/time selection should use platform pickers on native and appropriate controls on web.
- Disable submit while saving.
- Preserve user input after recoverable errors.

### Loading, empty, and error states

Every data-driven screen must implement:

- Skeleton or clear initial loader
- Pull-to-refresh or refresh action
- Useful empty state with one next action
- Inline recoverable error
- Permission-denied state
- Offline/network state
- Mutation progress and success feedback

Example empty state:

```text
No plans yet
Create the first event for your group.
[Create event]
```

## Component architecture

Create reusable components instead of styling each screen independently.

Suggested shared UI:

```text
components/UI/Screen.tsx
components/UI/AppHeader.tsx
components/UI/Button.tsx
components/UI/TextField.tsx
components/UI/Avatar.tsx
components/UI/AvatarStack.tsx
components/UI/Card.tsx
components/UI/EmptyState.tsx
components/UI/ErrorState.tsx
components/UI/LoadingSkeleton.tsx
components/UI/ConfirmDialog.tsx
components/UI/CategoryBadge.tsx
```

Suggested feature components:

```text
components/Calendar/CalendarView.tsx
components/Calendar/MemberDots.tsx
components/Calendar/EventCard.tsx
components/Groups/GroupCard.tsx
components/Groups/MemberRow.tsx
components/Groups/InviteCodeCard.tsx
```

Create centralized tokens:

```text
constants/colors.ts
constants/spacing.ts
constants/typography.ts
constants/categories.ts
```

## Responsive behavior

Planado is mobile-first but currently tested through localhost.

On narrow/mobile screens:

- Use full-width cards
- Use bottom tabs
- Use modal or full-screen forms
- Keep one primary column

On desktop web:

- Center the app shell with a practical maximum width
- Do not stretch mobile cards across the entire monitor
- Calendar may use a wider content area
- Keep the same information architecture as mobile

Recommended web shell:

```text
max-width: 1100px
main feed width: 680-760px
calendar width: up to 1000px
```

## Accessibility

- Meet WCAG AA contrast where practical.
- Do not use color alone to identify a member.
- Label icon-only controls.
- Support keyboard focus on web.
- Support system font scaling.
- Maintain at least 44 x 44 touch targets.
- Announce form errors clearly.
- Respect reduced-motion preferences.

## Error boundary and messaging

Do not show raw Supabase or PostgreSQL messages.

Translate errors into stable user-facing messages:

```text
Invalid invite -> We could not find that invitation.
Expired invite -> This invitation has expired.
Permission denied -> You do not have permission to do that.
Network failure -> Planado could not connect. Check your internet connection.
Username conflict -> That username is already taken.
OAuth cancelled -> No error alert; return to the login screen.
```

## Development commands

```powershell
cd C:\Users\Admin\Planado
npm install
npx expo start --web
```

Expected development URL:

```text
http://localhost:8081
```

Before handing off changes, run:

```powershell
npx tsc --noEmit
npx expo-doctor
```

Do not run `npm audit fix --force`; Expo pins compatible dependency versions.

## Environment and secrets

Expected public variables:

```text
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

The existing client temporarily accepts `EXPO_PUBLIC_SUPABASE_ANON_KEY` as a fallback.

Never commit:

- `.env`
- Supabase service-role or secret keys
- Google OAuth client secret
- Database password
- AI provider keys
- Production user exports

## Recommended implementation order

1. Generate Supabase TypeScript types.
2. Verify Google OAuth and profile migration on the hosted project.
3. Implement complete-profile onboarding.
4. Implement auth-aware root routing.
5. Build shared UI tokens and primitives.
6. Implement the four-tab shell.
7. Implement group and invite services.
8. Build Groups, Create Group, and Join Group screens.
9. Implement event service.
10. Build Calendar, Create Event, and Event Detail.
11. Add group/member Realtime subscriptions.
12. Build Home and Profile polish.
13. Add notifications and Storage uploads.
14. Add AI only after the shared calendar is stable.

## Definition of MVP done

The MVP is complete when two Google-authenticated users can:

1. Complete their profiles.
2. Create and join the same private group.
3. See one another in the member list.
4. Create, update, and cancel shared events.
5. View matching calendar updates without exposing the group to an unrelated user.
6. Log out and restore a valid session after reopening Planado.

AI, recurring events, advanced notification preferences, and production app-store release are not required for the first MVP.
