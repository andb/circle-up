// The join notice. With name search off, no line mentions name search.
export function noticeItems(nameSearch: boolean): string[] {
  return [
    "What you'd like to talk about is sent to Featherless, an AI inference provider, to form groups. Your name and profile links are not.",
    "If you give profile links, we read those pages once: LinkedIn and personal sites through Apify, GitHub from GitHub's public profile. The page text goes to Featherless, with your name, handle and links removed where we find them, which writes a short summary of your interests; only that summary is used to form groups. A failed read just means no summary. Apify keeps its own copy of the page; we delete it after the event.",
    ...(nameSearch
      ? ["If you give no LinkedIn link, we search LinkedIn for your name through Apify, and an AI on Featherless picks the likely match from job titles, companies and locations, compared with what you'd like to talk about, with names removed. Only you see it, and we use it only if you confirm it is you."]
      : []),
    "People in your groups see your name, what you'd like to talk about, and the profile links you give. The organiser's screen shows everyone's name and what they entered, except email.",
    "Email is optional. It is shown only to people you both said you'd talk to again, never sent to the AI or to analytics, and deleted when the event ends.",
    "What you enter is kept until the organiser ends the event, then deleted. The organiser's backups hold rules and rating numbers only, never what you entered.",
    "Ratings are private: nobody sees how they were rated, except that if you and someone both say you'd talk to each other again, you both see it, with each other's links and email. Numbers only (ratings, group sizes, model timing), never names or text, are sent to PostHog, an analytics service.",
  ];
}

export function consentLine(nameSearch: boolean): string {
  return nameSearch
    ? "Your talk line goes to an AI model and we read the links you give. With no LinkedIn link, we search LinkedIn for your name through Apify and an AI picks a match for you to confirm. Names and groups appear on the organiser's screen."
    : "Your talk line goes to an AI model and we read the links you give. Names and groups appear on the organiser's screen.";
}
