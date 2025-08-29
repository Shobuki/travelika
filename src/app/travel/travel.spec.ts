import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Travel } from './travel';

describe('Travel', () => {
  let component: Travel;
  let fixture: ComponentFixture<Travel>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Travel]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Travel);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
