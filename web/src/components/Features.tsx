import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from '../hooks/useMediaQuery';
import { Reveal } from './Reveal';

const k = (n: number): CSSProperties => ({ '--k': n }) as CSSProperties;

/** "How it works": the four feature cards from the approved design. */
export function Features() {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const docs = t('features.docs.items', { returnObjects: true }) as string[];
  const tips = t('features.tipsCard.tips', { returnObjects: true }) as {
    text: string;
    from: string;
  }[];

  return (
    <section className="sec" id="how">
      <Reveal className="sec-head">
        <p className="kicker">{t('features.how.kicker')}</p>
        <h2>{t('features.how.title')}</h2>
        <p>{t('features.how.body')}</p>
      </Reveal>
      <div className="feat-grid">
        <Reveal as="article" className="fcard f-a">
          <div className="viz">
            <svg
              className="graph"
              viewBox="0 0 420 215"
              role="img"
              aria-label={t('features.graph.aria')}
            >
              <path className="g-line" d="M50 125H380" />
              <path className="g-line" d="M160 125C200 25 340 25 380 125" />
              <path className="g-flow" d="M50 125H380" />
              <path className="g-flow" d="M160 125C200 25 340 25 380 125" />
              <circle className="g-node done" cx="50" cy="125" r="15" />
              <circle className="g-node done" cx="160" cy="125" r="15" />
              <circle className="g-node ready" cx="270" cy="125" r="15" />
              <circle className="g-node lock" cx="380" cy="125" r="15" />
              <text className="g-n" x="50" y="129.5" textAnchor="middle">
                1
              </text>
              <text className="g-n" x="160" y="129.5" textAnchor="middle">
                2
              </text>
              <text className="g-n dark" x="270" y="129.5" textAnchor="middle">
                3
              </text>
              <text className="g-n dark" x="380" y="129.5" textAnchor="middle">
                4
              </text>
              <text className="g-t" x="50" y="167" textAnchor="middle">
                {t('features.graph.register')}
              </text>
              <text className="g-t" x="50" y="181" textAnchor="middle">
                {t('features.graph.death')}
              </text>
              <text className="g-t" x="160" y="167" textAnchor="middle">
                {t('features.graph.certified')}
              </text>
              <text className="g-t" x="160" y="181" textAnchor="middle">
                {t('features.graph.copies')}
              </text>
              <text className="g-t" x="270" y="167" textAnchor="middle">
                {t('features.graph.legalHeir')}
              </text>
              <text className="g-t" x="270" y="181" textAnchor="middle">
                {t('features.graph.certificate')}
              </text>
              <text className="g-t" x="380" y="167" textAnchor="middle">
                {t('features.graph.bank')}
              </text>
              <text className="g-t" x="380" y="181" textAnchor="middle">
                {t('features.graph.claim')}
              </text>
              {!reduced && (
                <>
                  <circle className="g-dot" r="5.5">
                    <animateMotion dur="5s" repeatCount="indefinite" path="M50 125H380" />
                  </circle>
                  <circle className="g-dot" r="5.5">
                    <animateMotion
                      dur="5s"
                      begin="-2.5s"
                      repeatCount="indefinite"
                      path="M160 125C200 25 340 25 380 125"
                    />
                  </circle>
                </>
              )}
            </svg>
          </div>
          <h3>{t('features.order.title')}</h3>
          <p>{t('features.order.body')}</p>
        </Reveal>

        <Reveal as="article" className="fcard small f-b">
          <div className="viz">
            <ul className="mini-docs" aria-hidden="true">
              {docs.map((doc, i) => (
                <li style={k(i)} key={doc}>
                  <i></i>
                  {doc}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>{t('features.docs.title')}</h3>
            <p>{t('features.docs.body')}</p>
          </div>
        </Reveal>

        <Reveal as="article" className="fcard small f-c" play>
          <div className="viz">
            <svg className="ring" viewBox="0 0 120 120" aria-hidden="true">
              <circle className="r-bg" cx="60" cy="60" r="48" />
              <circle className="r-fg" cx="60" cy="60" r="48" transform="rotate(-90 60 60)" />
              <text className="r-big" x="60" y="62" textAnchor="middle">
                {t('features.deadlines.days')}
              </text>
              <text className="r-sm" x="60" y="80" textAnchor="middle">
                {t('features.deadlines.label')}
              </text>
            </svg>
          </div>
          <div>
            <h3>{t('features.deadlines.title')}</h3>
            <p>{t('features.deadlines.body')}</p>
          </div>
        </Reveal>

        <Reveal as="article" className="fcard small f-d">
          <div className="viz">
            <div className="tipstack" role="group" aria-label={t('features.tipsCard.aria')}>
              {tips.map((tip, i) => (
                <figure className="tipcard" style={k(i)} key={tip.from}>
                  <p>{tip.text}</p>
                  <figcaption>{tip.from}</figcaption>
                </figure>
              ))}
            </div>
          </div>
          <div>
            <h3>{t('features.tipsCard.title')}</h3>
            <p>{t('features.tipsCard.body')}</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
