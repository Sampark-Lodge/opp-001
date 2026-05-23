/**
 * main.js — InvoiceAI Landing Page Interactivity
 */

document.addEventListener('DOMContentLoaded', () => {
  // ─── Mobile Nav Toggle ─────────────────────────────────────────
  const toggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');
  if (toggle && navLinks) {
    toggle.addEventListener('click', () => {
      navLinks.classList.toggle('active');
    });
  }

  // ─── Close mobile nav on link click ────────────────────────────
  document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('active');
    });
  });

  // ─── Smooth scroll for anchor links ────────────────────────────
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ─── Scroll shadow on nav ──────────────────────────────────────
  const nav = document.querySelector('.nav');
  let lastScroll = 0;
  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    nav.style.borderBottomColor = scrollY > 20
      ? 'var(--border)'
      : 'transparent';
    lastScroll = scrollY;
  });
});
