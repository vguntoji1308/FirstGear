'use strict';
(function () {
  window.initDatePickers = () => {
    document.querySelectorAll('input[type="date"]').forEach((input) => {
      if (input._flatpickr) return;
      const label = document.querySelector(`label[for="${input.id}"]`);
      const picker = window.flatpickr(input, {
        disableMobile: true,
        altInput: true,
        allowInput: true,
        altFormat: 'd M Y',
        dateFormat: 'Y-m-d',
        ariaDateFormat: 'l, F j, Y',
        minDate: input.min || undefined,
        maxDate: input.max || undefined,
        onOpen: (_dates, _value, instance) => {
          const value = input.value;
          instance.set('minDate', input.min || null);
          instance.set('maxDate', input.max || null);
          instance.setDate(value, false);
          instance.altInput.setAttribute('aria-expanded', 'true');
        },
        onClose: (_dates, _value, instance) => instance.altInput.setAttribute('aria-expanded', 'false'),
        onReady: (_dates, _value, instance) => {
          instance.altInput.id = `${input.id}-display`;
          instance.altInput.classList.add('calendar-display');
          instance.altInput.setAttribute('aria-label', label ? label.textContent : 'Choose date');
          instance.altInput.setAttribute('aria-haspopup', 'dialog');
          instance.altInput.setAttribute('aria-expanded', 'false');
          instance.altInput.placeholder = 'Choose date';
          if (label) label.htmlFor = instance.altInput.id;
          instance.calendarContainer.setAttribute('role', 'dialog');
          instance.calendarContainer.setAttribute('aria-label', label ? label.textContent : 'Choose date');
          instance.altInput.addEventListener('keydown', (event) => {
            if (event.key !== 'ArrowDown') return;
            event.preventDefault();
            event.stopPropagation();
            instance.open();
            const day = instance.calendarContainer.querySelector('.selected:not(.flatpickr-disabled), .today:not(.flatpickr-disabled)') ||
              instance.calendarContainer.querySelector('.flatpickr-day:not(.flatpickr-disabled):not(.prevMonthDay):not(.nextMonthDay)');
            if (day) day.focus();
          });
        },
      });
      // Existing trip handlers can change another input's value or constraints.
      input.addEventListener('change', () => {
        document.querySelectorAll('input.flatpickr-input').forEach((other) => {
          const instance = other._flatpickr;
          if (instance) {
            const value = other.value;
            instance.set('minDate', other.min || null);
            instance.set('maxDate', other.max || null);
            instance.setDate(value, false);
          }
        });
      });
      if (input.form) input.form.addEventListener('reset', () => {
        setTimeout(() => picker.setDate(input.value, false));
      });
    });
  };
})();
