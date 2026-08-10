# Planado Frontend Handoff

## Product summary

Planado is a private shared-calendar application for friend groups. Users sign in with Google, create or join groups, share events through a group calendar, see member availability, and respond to plans.

The MVP flow is:

```text
Google sign-in
→ Complete profile
→ Create or join a group
→ View group calendar
→ Create an event
→ Other members receive the update
```

AI summaries and shared-free-time suggestions are future features. They must not block the calendar MVP.

## Technology already selected

- React Native with Expo and TypeScript
- Expo Router
- Supabase Auth, Postgres, Storage, and Realtime
- Google-only authentication
- Web development through `http://localhost:8081`
- Android and iOS builds later

## Authentication decision

Planado does not use email/password registration.

Do not build:

- Password inputs
- Registration forms
- Confirm-password fields
- Forgot-password screens
- Email verification screens

The only sign-in action is:

```ts
signInWithGoogle()
```

The frontend should import it from:

```text
services/authService.ts
```

After the first Google login, Supabase creates a `profiles` record using the user's Google name, email, and avatar. The generated profile starts with:

```text
onboarding_completed = false
```

The user must then choose a Planado username, confirm their display name, select a timezone, and optionally select a default color. After saving, set `onboarding_completed` to `true`.

## Navigation structure

```text
app/
├── index.tsx
├── _layout.tsx
├── (auth)/
│   ├── login.tsx
│   └── complete-profile.tsx
├── (tabs)/
│   ├── _layout.tsx
│   ├── home.tsx
│   ├── calendar.tsx
│   ├── groups.tsx
│   └── profile.tsx
├── group/
│   ├── create.tsx
│   ├── join.tsx
│   ├── [groupId].tsx
│   ├── members.tsx
│   ├── invite.tsx
│   └── settings.tsx
├── event/
│   ├── create.tsx
│   └── [eventId].tsx
└── notifications.tsx
```

Routes not currently present may be added by the frontend developer.

## Startup routing

`app/index.tsx` is a routing screen, not a designed product page.

It should follow this logic:

```text
Auth session loading
→ Show centered loading indicator

No authenticated user
→ Redirect to /login

Authenticated, onboarding incomplete
→ Redirect to /complete-profile

Authenticated, onboarding complete
→ Redirect to /home
```

The authentication state is available through:

```ts
const { user, session, loading, isAuthenticated } = useAuth();
```

## Required screens

### Login

Route:

```text
app/(auth)/login.tsx
```

Content:

- Planado logo and name
- Short explanation of the shared-calendar concept
- Continue with Google button
- Loading state while the browser is open
- Friendly cancellation and error messages
- Terms and privacy links

Call:

```ts
await signInWithGoogle();
```

Do not place Google client secrets in the frontend.

### Complete profile

Route:

```text
app/(auth)/complete-profile.tsx
```

Fields:

- Google avatar preview
- Display name
- Unique username
- Timezone
- Default member color

Validation:

- Username is 3–30 characters
- Username contains lowercase letters, numbers, periods, or underscores
- Display name is 1–60 characters
- Timezone is required

On save, call `updateMyProfile()` and set `onboarding_completed: true`.

### Home

Route:

```text
app/(tabs)/home.tsx
```

Sections:

- Greeting and avatar
- Notification bell with unread count
- Upcoming events across all groups
- Recently used groups
- Quick actions: Create event, Create group, Join group

If the user has no groups, show create and join actions instead of an empty dashboard.

### Calendar

Route:

```text
app/(tabs)/calendar.tsx
```

Requirements:

- Month navigation
- Today button
- Group selector
- Member and category filters
- Colored member dots on dates
- Event list for the selected date
- Create-event action
- Realtime updates

Only load events for the visible date range. Do not request every event.

### Groups

Route:

```text
app/(tabs)/groups.tsx
```

Each card should show:

- Group name and image
- Member count
- Avatar stack
- Current user's role
- Next event

Actions:

- Open group
- Create group
- Join group

### Create group

Route:

```text
app/group/create.tsx
```

Fields:

- Name
- Description
- Image, optional
- Timezone
- Creator's member color

Call the group service. Do not insert directly into `groups` or `group_members` from a screen.

### Join group

Route:

```text
app/group/join.tsx
```

Fields:

- Invite code
- Member color

Normalize invite codes to uppercase and remove surrounding spaces.

### Group detail

Route:

```text
app/group/[groupId].tsx
```

Sections:

- Group header and image
- Upcoming events
- Calendar preview
- Members and roles
- Create-event button
- Invite button
- Settings button for owner/admin

### Group members

Route:

```text
app/group/members.tsx?groupId=...
```

Show avatar, name, username, member color, and role.

Only show management actions allowed by the current role. The backend RLS remains the final authority.

### Group settings

Route:

```text
app/group/settings.tsx?groupId=...
```

Support:

- Update name, description, image, and timezone
- View, copy, share, and disable invites
- Transfer ownership
- Leave group
- Archive or delete group with confirmation

### Create event

Route:

```text
app/event/create.tsx
```

Fields:

- Group
- Title
- Description
- Category
- Start and end date/time
- All-day toggle
- Location
- Visibility
- Optional color and attachment

Categories:

```text
hangout, birthday, school, work, study, gym,
trip, deadline, personal, other
```

End time cannot be earlier than start time.

### Event detail

Route:

```text
app/event/[eventId].tsx
```

Show:

- Event information
- Creator and group
- Description and location
- RSVP counts and current response
- Going, Maybe, and Declined actions
- Edit, cancel, or delete actions when permitted

Cancelled events should remain visible with a cancelled badge and muted styling.

### Profile

Route:

```text
app/(tabs)/profile.tsx
```

Show and edit:

- Google avatar
- Display name
- Username
- Bio
- Timezone
- Notification preferences
- Logout action

Do not add password-change controls.

### Notifications

Route:

```text
app/notifications.tsx
```

Types:

- Member joined
- Event created
- Event updated
- Event cancelled
- Event reminder

Support unread indicators, opening related content, mark as read, and mark all as read.

## Frontend/backend boundary

Use this dependency direction:

```text
Screen
→ Hook
→ Service
→ Supabase
```

Screens should not contain direct Supabase table queries.

Frontend owns:

- Screens and navigation
- Forms and client-side validation
- Design system and responsive layout
- Loading, empty, offline, and error states
- Accessibility
- Calling hooks and services

Backend owns:

- Supabase client and authentication
- Database schema and migrations
- Service functions and generated database types
- RPC functions and RLS policies
- Realtime subscriptions
- Storage policies
- Edge Functions, push delivery, and AI integration

## Service contracts

### Authentication service

Available or planned:

```text
signInWithGoogle
signOut
getSession
getCurrentUser
getMyProfile
updateMyProfile
```

### Group service

Planned:

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

### Invite service

Planned:

```text
createInvite
getInvites
disableInvite
deleteInvite
joinGroupByCode
```

### Event service

Planned:

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

If a service is not ready, mock its return value in the UI layer without adding direct database calls to screens.

## Required UI states

Every data-driven screen must support:

- Initial loading
- Loaded with data
- Loaded with no data
- Refreshing
- Submission in progress
- Recoverable error
- Permission denied
- Offline/network unavailable

Do not leave a screen blank while loading.

## Error presentation

Never show raw PostgreSQL or Supabase errors to users.

Examples:

```text
Invalid invite code
→ We couldn't find that invitation.

Permission denied
→ You don't have permission to do that.

Failed to fetch
→ Planado couldn't connect. Check your internet connection.
```

## Design direction

Planado should feel social, friendly, organized, and lightweight.

Member colors are functional. Use them consistently in calendar dots, event cards, avatar borders, and member lists. Do not communicate identity with color alone; include a name, avatar, initials, or label.

Minimum accessibility expectations:

- Sufficient text contrast
- Large touch targets
- Support system font scaling
- Labels for icon-only buttons
- Visible focus states on web
- Accessible form error text

## Local development

Install dependencies:

```powershell
npm install
```

Create `.env` from `.env.example` and add the Supabase project URL and publishable key.

Start the web application:

```powershell
npx expo start --web
```

Expected local address:

```text
http://localhost:8081
```

The Supabase redirect allow list must contain:

```text
http://localhost:8081/**
```

Do not commit `.env`, secret keys, service-role keys, or Google client secrets.

## Delivery priority

### Phase 1: Core MVP

1. Google login
2. Complete profile
3. Auth-aware startup routing
4. Main tab navigation
5. Group list
6. Create and join group
7. Group detail and members
8. Shared calendar
9. Create and view events
10. Profile and logout

### Phase 2: Social features

1. Realtime updates
2. RSVP responses
3. Invite sharing
4. Notifications
5. Images and attachments
6. Calendar filters

### Phase 3: AI

1. Weekly and monthly summaries
2. Yearly group recap
3. Shared free-time suggestions
4. Ask-AI schedule questions

The frontend should complete and verify each Phase 1 flow before beginning AI work.
