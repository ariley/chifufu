import Image from "next/image";

const sampleFinds = [
  { item: "pantry staples", place: "nearby grocery", signal: "lower shelf price" },
  { item: "weekday dinner", place: "local takeout", signal: "better pickup value" },
  { item: "pet basics", place: "pet supply stop", signal: "worth the extra mile" },
];

const steps = [
  {
    title: "Start with the real errand",
    body: "Milk, rice, dinner for two, dog food, coffee on the way home. The app starts with the thing you actually need.",
  },
  {
    title: "See the tradeoff",
    body: "Price matters, but so does distance. Chifufu is being built to show both, without burying the useful answer.",
  },
  {
    title: "Decide faster",
    body: "The point is not another shopping habit. It is a calmer way to pick the best option before leaving home.",
  },
];

export default function HomePage() {
  return (
    <div className="bg-[#fbfaf6] text-[#193126]">
      <section className="mx-auto grid min-h-[calc(100vh-64px)] max-w-6xl grid-cols-1 gap-12 px-6 pb-12 pt-12 md:grid-cols-[1fr_430px] md:items-center md:pt-16">
        <div>
          <p className="mb-5 inline-flex rounded-full border border-[#cfe5d4] bg-white px-4 py-2 text-sm font-medium text-[#28734e]">
            In development for everyday food budgets
          </p>
          <h1 className="max-w-3xl text-[48px] font-semibold leading-[1.02] tracking-normal text-[#10291f] md:text-[72px]">
            Spend less guessing where food is cheaper.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[#4d6559]">
            Chifufu is a simple app in progress for comparing nearby grocery
            runs, takeout decisions, and quick food stops before you spend money
            or make the drive.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="#early-access"
              className="inline-flex h-12 items-center justify-center rounded-lg bg-[#1D9E75] px-6 text-base font-semibold text-white shadow-sm transition hover:bg-[#168765]"
            >
              Follow the launch
            </a>
            <a
              href="#how-it-works"
              className="inline-flex h-12 items-center justify-center rounded-lg border border-[#b7d8c0] bg-white px-6 text-base font-semibold text-[#193126] transition hover:border-[#1D9E75]"
            >
              See how it works
            </a>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[390px]">
          <div className="relative aspect-[9/19.5] rounded-[56px] border border-[#d7e6d8] bg-white p-3 shadow-[0_24px_80px_rgba(29,64,44,0.14)]">
            <div className="h-full rounded-[48px] bg-[#071b15] p-3 shadow-inner">
              <div className="mx-auto mb-4 h-7 w-28 rounded-full bg-[#06120f]" />
              <div className="flex h-[calc(100%-44px)] flex-col rounded-[38px] bg-[#10291f] p-5 text-white">
                <div className="mb-7 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Image
                      src="/chifufu-icon.png"
                      alt="Chifufu app icon"
                      width={52}
                      height={52}
                      className="rounded-xl"
                      priority
                    />
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-[#94d6b6]">
                        Chifufu
                      </p>
                      <p className="mt-1 text-xl font-semibold">Food choices, sorted</p>
                    </div>
                  </div>
                  <div className="shrink-0 rounded-md bg-[#1D9E75] px-3 py-1 text-sm font-semibold">
                    Preview
                  </div>
                </div>

                <div className="rounded-2xl bg-white p-3 text-[#193126]">
                  <p className="mb-3 text-sm font-medium text-[#65786e]">
                    The kind of answers we are building toward
                  </p>
                  <div className="space-y-3">
                    {sampleFinds.map((example) => (
                      <div
                        key={example.item}
                        className="flex items-center justify-between gap-4 rounded-xl border border-[#e5eee7] bg-[#fbfaf6] p-3"
                      >
                        <div>
                          <p className="text-base font-semibold capitalize">
                            {example.item}
                          </p>
                          <p className="text-sm text-[#607267]">{example.place}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-[#1D9E75]">
                            {example.signal}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-[#183b2d] p-4">
                    <p className="text-2xl font-semibold">Price</p>
                    <p className="text-sm text-[#b7d8c0]">what it may cost</p>
                  </div>
                  <div className="rounded-2xl bg-[#183b2d] p-4">
                    <p className="text-2xl font-semibold">Trip</p>
                    <p className="text-sm text-[#b7d8c0]">whether it is worth it</p>
                  </div>
                </div>

                <div className="mt-auto pt-8">
                  <div className="mx-auto h-1.5 w-28 rounded-full bg-[#345247]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="how-it-works"
        className="border-y border-[#dfe9df] bg-white px-6 py-16"
      >
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#1D9E75]">
              Built for ordinary food decisions
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-[#10291f] md:text-4xl">
              Not coupon clipping. Not restaurant ads. Just a clearer way to choose.
            </h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {steps.map((step) => (
              <article
                key={step.title}
                className="rounded-lg border border-[#dfe9df] bg-[#fbfaf6] p-6"
              >
                <h3 className="text-xl font-semibold text-[#10291f]">{step.title}</h3>
                <p className="mt-3 leading-7 text-[#536a5f]">{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-8 px-6 py-16 md:grid-cols-[0.8fr_1.2fr] md:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#1D9E75]">
            Why Chifufu exists
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-[#10291f] md:text-4xl">
            Most food apps are built to sell the order. Chifufu is built around the decision before it.
          </h2>
        </div>
        <div className="space-y-5 text-lg leading-8 text-[#4d6559]">
          <p>
            Most people do not need another glossy marketplace. They need to know
            whether the cheaper dinner is across the street, whether bulk rice is
            worth the extra stop, or whether pickup is the better deal tonight.
          </p>
          <p>
            The goal is simple: give budget-conscious shoppers a calmer way to
            compare options and make a decision they can actually use.
          </p>
        </div>
      </section>

      <section
        id="early-access"
        className="border-t border-[#dfe9df] bg-[#10291f] px-6 py-16 text-white"
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#94d6b6]">
              Launching carefully
            </p>
            <h2 className="mt-3 text-3xl font-semibold md:text-4xl">
              We are building the useful version first.
            </h2>
            <p className="mt-4 text-lg leading-8 text-[#d4e6dc]">
              No fake marketplace and no pretend ordering flow. The first job is
              trustworthy food comparison for people watching what they spend.
            </p>
          </div>
          <a
            href="mailto:hello@chifufu.com?subject=Chifufu%20early%20access"
            className="inline-flex h-12 items-center justify-center rounded-lg bg-white px-6 text-base font-semibold text-[#10291f] transition hover:bg-[#e4f3ec]"
          >
            Ask about early access
          </a>
        </div>
      </section>
    </div>
  );
}
