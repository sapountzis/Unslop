import { motion } from 'framer-motion';

export default function FadeIn({ children, delay = 0, className = '' }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay, ease: 'easeOut' }}
      viewport={{ once: true, amount: 0.35 }}
    >
      {children}
    </motion.div>
  );
}
