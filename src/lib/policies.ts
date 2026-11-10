/**
 * Documents every person must read and acknowledge. Changing a document's text means
 * changing its version too, so everyone is asked again.
 */
export type PolicyDocument = {
  key: string;
  version: string;
  /**
   * Only live documents are shown to staff. A draft waits for management to read and approve
   * its text; then set this to true and deploy. It shows in Compliance → Acknowledgements either way.
   */
  live: boolean;
  title: string;
  summary: string;
  /** yes: what happens, no: what never happens, info: everything else. Sets the icon and colour. */
  sections: { heading: string; tone: "yes" | "no" | "info"; items: string[] }[];
};

export const POLICY_DOCUMENTS: PolicyDocument[] = [
  {
    key: "MONITORING_NOTICE",
    version: "2026-11-10",
    live: true,
    title: "What WorkTrack records about your work",
    summary:
      "WorkTrack records your working time so attendance, breaks and pay are correct. Read what is recorded, why, and for how long.",
    sections: [
      {
        heading: "What is recorded",
        tone: "yes",
        items: [
          "Sign-in and sign-out times, and every time your work timer starts and stops.",
          "Breaks (Tea 1, Tea 2, Lunch), washroom visits and meetings: start, end and length.",
          "Time with no keyboard or mouse use while signed in (idle time). It is not used to sign you out.",
          "When your app was last open, to show you as online in chat.",
          "Chat messages and files you send in WorkTrack chat.",
          "Every sign-in attempt, with the network address it came from.",
          "Changes you make in WorkTrack, in the audit log.",
        ],
      },
      {
        heading: "What is not recorded",
        tone: "no",
        items: [
          "Websites you visit, your screen, camera, microphone or location.",
          "Anything outside WorkTrack.",
        ],
      },
      {
        heading: "Why",
        tone: "info",
        items: [
          "To mark attendance and calculate productive time, overtime and pay.",
          "To keep accounts safe, for example by stopping repeated wrong passwords.",
        ],
      },
      {
        heading: "Who sees it and for how long",
        tone: "info",
        items: [
          "Super Admin and HR see attendance, breaks and activity. Super Admin is alerted to sign-ins and actions.",
          "Chat messages and files are deleted after 7 days.",
          "Sign-in attempts and read notifications are deleted after 180 days, online status after 30 days.",
          "Attendance, leave and pay records are kept as long as the law requires.",
        ],
      },
      {
        heading: "Questions",
        tone: "info",
        items: ["Ask HR or Super Admin if anything here is unclear, or to see what is recorded about you."],
      },
    ],
  },
  {
    key: "SECURITY_POLICY",
    version: "draft-2026-11-10",
    live: false,
    title: "How we keep company and client data safe",
    summary:
      "The rules everyone at Quore B2B follows to protect client data, company accounts and each other. Read them and confirm you will follow them.",
    sections: [
      {
        heading: "Your account",
        tone: "yes",
        items: [
          "Use a password of at least 12 characters that you use nowhere else, and keep it to yourself.",
          "Never share your WorkTrack, email or client tool login, even with a colleague or a manager.",
          "Lock your screen (Windows key + L) whenever you leave your desk.",
          "Turn on two-factor sign-in wherever it is offered.",
        ],
      },
      {
        heading: "Client and company data",
        tone: "yes",
        items: [
          "Use client lists, contacts and campaign data only for the work you were given.",
          "Keep data in company tools. Do not copy it to personal email, phones, USB drives or chat apps.",
          "Send files to clients only through the channel your manager approved.",
          "Delete local copies of client files when the task is done.",
        ],
      },
      {
        heading: "Never",
        tone: "no",
        items: [
          "Install software, browser extensions or AI tools on company machines without IT's approval.",
          "Paste client data into public websites or AI chat tools.",
          "Try to get access you were not given, or look at records you do not need for your work.",
        ],
      },
      {
        heading: "If something goes wrong",
        tone: "info",
        items: [
          "Report a lost laptop or phone, a suspicious email, or a mistake with data to IT or Super Admin straight away.",
          "Reporting quickly is always right. Nobody is blamed for an honest report.",
          "Breaking these rules on purpose can lead to disciplinary action.",
        ],
      },
    ],
  },
  {
    key: "SECURITY_TRAINING",
    version: "draft-2026-11-10",
    live: false,
    title: "Security basics: spotting scams and staying safe",
    summary:
      "Short training every person completes once a year. It covers the tricks attackers use most against teams like ours.",
    sections: [
      {
        heading: "Spot a phishing message",
        tone: "info",
        items: [
          "It is urgent, scary or too good to be true: an unpaid invoice, a locked account, a prize.",
          "The sender address or link does not match the company it claims to be from. Hover before you click.",
          "It asks for a password, a code, a payment or a change of bank details.",
        ],
      },
      {
        heading: "What to do",
        tone: "yes",
        items: [
          "Do not click, reply or open attachments. Report it to IT or Super Admin.",
          "Check a payment or bank-detail request by calling the person on a number you already have.",
          "If you already clicked or typed a password, say so at once and change that password.",
        ],
      },
      {
        heading: "Every day",
        tone: "yes",
        items: [
          "Keep Windows and your browser updated, and restart when asked.",
          "Use only company Wi-Fi or a trusted network for client work. Avoid public Wi-Fi.",
          "WorkTrack, Super Admin and IT will never ask for your password or sign-in code.",
        ],
      },
      {
        heading: "Never",
        tone: "no",
        items: [
          "Share a one-time code with anyone, for any reason.",
          "Plug in a USB drive you found or were sent without asking IT.",
        ],
      },
    ],
  },
];
